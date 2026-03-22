/**
 * On Notice — Nightly Pipeline Orchestrator
 *
 * Runs nightly via GitHub Actions. Processes Federal Parliament (HoR) by default.
 * Usage: ts-node src/index.ts [--parliament fed_hor] [--date 2025-04-09] [--skip-audio]
 */

import { parseArgs } from "node:util";
import { format } from "date-fns";
import { db } from "./db/client";
import { PARLIAMENTS } from "./config";
import { syncFederalMembers } from "./scrapers/fed-members";
import { findHansardDocuments, downloadHansardXml } from "./scrapers/fed-hansard";
import { fetchDivisionsForDate } from "./scrapers/tvfy-divisions";
import { parseHansardXml } from "./parsers/hansard-xml";
import { classifyQuestion, resetMemberCache } from "./parsers/questions";
import { summariseBill } from "./ai/summarise-bill";
import { summariseQuestion } from "./ai/summarise-question";
import { summariseDay } from "./ai/summarise-day";
import { upsertDivisions } from "./db/upsert-divisions";

async function run() {
  const { values } = parseArgs({
    options: {
      parliament: { type: "string", default: "fed_hor" },
      date: { type: "string", default: format(new Date(), "yyyy-MM-dd") },
      "skip-audio": { type: "boolean", default: false },
      "members-only": { type: "boolean", default: false },
    },
  });

  const parliamentId = values.parliament as string;
  const date = values.date as string;
  const skipAudio = values["skip-audio"] as boolean;

  const config = PARLIAMENTS[parliamentId];
  if (!config) throw new Error(`Unknown parliament: ${parliamentId}`);

  console.log(`\n=== On Notice Pipeline ===`);
  console.log(`Parliament: ${config.name}`);
  console.log(`Date: ${date}`);
  console.log(`Skip audio: ${skipAudio}`);
  console.log(`========================\n`);

  // ── Step 1: Sync members (weekly) ───────────────────────────────────────────
  console.log("Step 1: Syncing members...");
  if (config.jurisdiction === "federal") {
    await syncFederalMembers(parliamentId as "fed_hor" | "fed_sen");
  }
  if (values["members-only"]) {
    console.log("Members-only mode, exiting.");
    return;
  }
  resetMemberCache();

  // ── Step 2: Check for sitting / create sitting_days row ─────────────────────
  console.log("Step 2: Checking for sitting day...");
  const chamber = config.jurisdiction === "federal"
    ? (config.chamber === "lower" ? "reps" : "senate")
    : "reps";

  const documents = await findHansardDocuments(date, chamber as "reps" | "senate");
  if (documents.length === 0) {
    console.log(`No Hansard found for ${date} — parliament likely not sitting. Exiting.`);
    return;
  }

  const { data: sitting, error: sittingError } = await db
    .from("sitting_days")
    .upsert(
      {
        parliament_id: parliamentId,
        sitting_date: date,
        hansard_url: documents[0]?.xmlUrl ?? null,
        pipeline_status: "running",
      },
      { onConflict: "parliament_id,sitting_date" }
    )
    .select("id")
    .single();

  if (sittingError || !sitting) throw new Error(`Failed to create sitting day: ${sittingError?.message}`);
  const sittingDayId = sitting.id;
  console.log(`Sitting day ID: ${sittingDayId}`);

  try {
    // ── Step 3: Download + parse Hansard ──────────────────────────────────────
    console.log("Step 3: Downloading Hansard XML...");
    const xmlContents = await Promise.all(documents.map(downloadHansardXml));
    const allBills = [];
    const allQuestions = [];

    for (const xml of xmlContents) {
      const parsed = parseHansardXml(xml);
      allBills.push(...parsed.bills);
      allQuestions.push(...parsed.questions);
    }

    console.log(`Parsed: ${allBills.length} bills, ${allQuestions.length} questions`);

    // ── Step 4: Fetch divisions from TVFY ────────────────────────────────────
    console.log("Step 4: Fetching divisions...");
    const tvfyHouse = config.chamber === "lower" ? "representatives" : "senate";
    const divisions = await fetchDivisionsForDate(date, tvfyHouse as "representatives" | "senate");
    console.log(`Fetched ${divisions.length} divisions from They Vote For You`);

    // Get member lookup function
    const { data: members } = await db
      .from("members")
      .select("id, name_last, name_first, party_id, parties(short_name)")
      .eq("parliament_id", parliamentId)
      .eq("is_active", true);

    const memberLookup = (lastName: string, firstName: string, party: string): string | null => {
      const m = (members ?? []).find(
        (m) =>
          m.name_last.toUpperCase() === lastName.toUpperCase() &&
          (m.name_first?.toLowerCase().startsWith(firstName.toLowerCase().slice(0, 2)) ?? true)
      );
      return m?.id ?? null;
    };

    await upsertDivisions(sittingDayId, parliamentId, divisions, memberLookup);

    // ── Step 5: Classify questions (Dorothy Dixer detection) ─────────────────
    console.log("Step 5: Classifying questions...");
    const classifiedQuestions = await Promise.all(
      allQuestions.map(async (q) => {
        const cls = await classifyQuestion(
          q.askerName,
          q.ministerName,
          parliamentId,
          config.governmentParties,
          q.questionText
        );
        return { ...q, ...cls };
      })
    );

    const realQuestions = classifiedQuestions.filter((q) => !q.isDorothyDixer);
    const dixerCount = classifiedQuestions.length - realQuestions.length;
    console.log(`Questions: ${realQuestions.length} real, ${dixerCount} Dorothy Dixers`);

    // ── Step 6: AI enrichment ─────────────────────────────────────────────────
    console.log("Step 6: AI enrichment...");

    const enrichedBills = await Promise.all(
      allBills.map(async (bill) => {
        const summary = await summariseBill({
          shortTitle: bill.shortTitle,
          introducerName: bill.introducerName,
          introducerParty: null,
          introductionText: bill.introductionText,
          parliament: config.name,
          date,
        }).catch((e) => {
          console.warn(`Bill summary failed: ${e.message}`);
          return null;
        });

        const { error } = await db.from("bills").upsert(
          {
            parliament_id: parliamentId,
            sitting_day_id: sittingDayId,
            short_title: bill.shortTitle,
            long_title: bill.longTitle,
            bill_stage: bill.stage,
            ai_summary: summary,
          },
          { onConflict: "parliament_id,bill_number" }
        );
        if (error) console.warn(`Bill upsert error: ${error.message}`);

        return { title: bill.shortTitle, party: null, summary };
      })
    );

    const enrichedQuestions = await Promise.all(
      classifiedQuestions.map(async (q) => {
        let aiSummary: string | null = null;

        if (!q.isDorothyDixer) {
          const result = await summariseQuestion({
            askerName: q.askerName ?? "Unknown",
            askerParty: "Unknown",
            ministerName: q.ministerName ?? "Unknown",
            ministerParty: "Unknown",
            ministerRole: null,
            subject: q.subject,
            questionText: q.questionText,
            answerText: q.answerText,
          }).catch((e) => {
            console.warn(`Question summary failed: ${e.message}`);
            return null;
          });
          aiSummary = result?.summary ?? null;
        }

        const { error } = await db.from("questions").insert({
          sitting_day_id: sittingDayId,
          question_number: q.questionNumber,
          asker_id: q.askerMemberId,
          minister_id: q.ministerMemberId,
          subject: q.subject,
          question_text: q.questionText,
          answer_text: q.answerText,
          is_dorothy_dixer: q.isDorothyDixer,
          ai_summary: aiSummary,
        });
        if (error) console.warn(`Question insert error: ${error.message}`);

        return { asker: q.askerName ?? "", minister: q.ministerName ?? "", subject: q.subject, summary: aiSummary };
      })
    );

    // ── Step 7: Daily digest ──────────────────────────────────────────────────
    console.log("Step 7: Generating daily digest...");
    const divisionSummaries = divisions.map((d) => ({
      subject: d.name,
      result: d.outcome,
      ayes: d.aye_votes.length,
      noes: d.no_votes.length,
    }));

    const digest = await summariseDay({
      date,
      parliament: config.name,
      bills: enrichedBills.filter(Boolean) as Array<{ title: string; party: string | null; summary: string | null }>,
      divisions: divisionSummaries,
      questions: enrichedQuestions.filter((q) => {
        const classified = classifiedQuestions.find(
          (c) => c.questionNumber === allQuestions.indexOf(allQuestions.find((aq) => aq.subject === q.subject)!) + 1
        );
        return !classified?.isDorothyDixer;
      }),
    }).catch((e) => {
      console.warn(`Daily digest failed: ${e.message}`);
      return { lede: "", digest: "" };
    });

    await db.from("daily_digests").upsert(
      {
        sitting_day_id: sittingDayId,
        lede: digest.lede,
        ai_summary: digest.digest,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "sitting_day_id" }
    );

    // ── Step 8: Audio pipeline (Phase 2, skip for now) ───────────────────────
    if (!skipAudio) {
      console.log("Step 8: Audio pipeline (not yet implemented — skipping)");
      // TODO: Phase 2 implementation
    }

    // ── Step 9: Mark complete ─────────────────────────────────────────────────
    await db
      .from("sitting_days")
      .update({ pipeline_status: "complete" })
      .eq("id", sittingDayId);

    console.log("\n✓ Pipeline complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nPipeline error: ${message}`);

    await db
      .from("sitting_days")
      .update({ pipeline_status: "error", pipeline_error: message })
      .eq("id", sittingDayId);

    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
