/**
 * On Notice — Nightly Pipeline Orchestrator
 *
 * Runs nightly via GitHub Actions. Processes Federal Parliament (HoR) by default.
 * Usage: ts-node src/index.ts [--parliament fed_hor] [--date 2025-04-09] [--skip-audio]
 */

import { parseArgs } from "node:util";
import { format } from "date-fns";
import { db } from "./db/client";
import { PARLIAMENTS, FEDERAL_PARTIES } from "./config";
import { syncFederalMembers } from "./scrapers/fed-members";
import { fetchDebates, fetchSpeechRows } from "./scrapers/fed-hansard";
import { fetchDivisionsForDate } from "./scrapers/tvfy-divisions";
import { parseDebates } from "./parsers/hansard-xml";
import { classifyQuestion, resetMemberCache } from "./parsers/questions";
import { summariseBill } from "./ai/summarise-bill";
import { summariseQuestion } from "./ai/summarise-question";
import { summariseDay } from "./ai/summarise-day";
import { summariseDivision } from "./ai/summarise-division";
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
  const oaType = config.chamber === "lower" ? "representatives" : "senate";

  const debateData = await fetchDebates(date, oaType as "representatives" | "senate");
  if (!debateData) {
    console.log(`No debates found for ${date} — parliament likely not sitting. Exiting.`);
    return;
  }

  const { data: sitting, error: sittingError } = await db
    .from("sitting_days")
    .upsert(
      {
        parliament_id: parliamentId,
        sitting_date: date,
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
    // ── Step 3: Parse debates from OpenAustralia ───────────────────────────────
    console.log("Step 3: Parsing debates...");
    const { bills: allBills, questions: allQuestions, divisionTimes } = parseDebates(debateData);

    console.log(`Parsed: ${allBills.length} bills, ${allQuestions.length} questions`);

    // ── Step 3b: Enrich questions with full speech content from OA ─────────────
    console.log("Step 3b: Fetching individual speech content for questions...");
    const stripHtml = (html: string) => html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#8212;/g, "—").replace(/&#8211;/g, "–").replace(/&#8216;/g, "'")
      .replace(/&#8217;/g, "'").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, " ")
      .replace(/\s+/g, " ").trim();

    const questionsWithContent = [];
    for (const q of allQuestions) {
      if (!q.gid) {
        questionsWithContent.push(q);
        continue;
      }

      const rows = await fetchSpeechRows(q.gid, oaType as "representatives" | "senate").catch(() => []);

      // First htype=12 row is the question; subsequent ones include the answer
      const speechRows = rows.filter((r) => r.htype === "12");
      const questionRow = speechRows[0];
      const answerRows = speechRows.slice(1);

      questionsWithContent.push({
        ...q,
        askerName: questionRow?.speaker
          ? `${questionRow.speaker.first_name} ${questionRow.speaker.last_name}`
          : q.askerName,
        askerParty: questionRow?.speaker?.party ?? q.askerParty,
        ministerName: answerRows[0]?.speaker
          ? `${answerRows[0].speaker.first_name} ${answerRows[0].speaker.last_name}`
          : q.ministerName,
        ministerParty: answerRows[0]?.speaker?.party ?? q.ministerParty,
        questionText: questionRow?.body ? stripHtml(questionRow.body) : q.questionText,
        answerText: answerRows.map((r) => stripHtml(r.body ?? "")).filter(Boolean).join("\n\n"),
      });
    }
    console.log(`Enriched ${questionsWithContent.filter((q) => q.askerName).length} questions with speaker info`);

    // ── Step 4: Fetch divisions from TVFY ────────────────────────────────────
    console.log("Step 4: Fetching divisions...");
    const tvfyHouse = config.chamber === "lower" ? "representatives" : "senate";
    const divisions = await fetchDivisionsForDate(date, tvfyHouse as "representatives" | "senate");
    console.log(`Fetched ${divisions.length} divisions from They Vote For You`);

    // Get member lookup function
    const { data: members } = await db
      .from("members")
      .select("id, name_last, name_first, party_id, parties(short_name)")
      .eq("parliament_id", parliamentId);

    const memberLookup = (lastName: string, firstName: string, party: string): string | null => {
      const m = (members ?? []).find(
        (m) =>
          m.name_last.toUpperCase() === lastName.toUpperCase() &&
          (m.name_first?.toLowerCase().startsWith(firstName.toLowerCase().slice(0, 2)) ?? true)
      );
      return m?.id ?? null;
    };

    await upsertDivisions(sittingDayId, parliamentId, divisions, memberLookup, divisionTimes);

    // Generate AI summaries for divisions
    const { data: upsertedDivisions } = await db
      .from("divisions")
      .select("id, division_number, subject, result, ayes_count, noes_count, ai_summary")
      .eq("sitting_day_id", sittingDayId)
      .order("division_number");

    for (const div of upsertedDivisions ?? []) {
      const summary = await summariseDivision({
        subject: div.subject,
        result: div.result ?? "unknown",
        ayesCount: div.ayes_count ?? 0,
        noesCount: div.noes_count ?? 0,
        divisionNumber: div.division_number ?? 0,
        date,
        parliament: config.name,
      }).catch((e) => { console.warn(`Division summary failed: ${e.message}`); return null; });
      if (summary) {
        await db.from("divisions").update({ ai_summary: summary }).eq("id", div.id);
      }
    }

    // ── Step 5: Classify questions (Dorothy Dixer detection) ─────────────────
    console.log("Step 5: Classifying questions...");
    const classifiedQuestions: Array<(typeof questionsWithContent)[0] & { isDorothyDixer: boolean; askerMemberId: string | null; ministerMemberId: string | null }> = [];
    for (const q of questionsWithContent) {
      const cls = await classifyQuestion(
        q.askerName,
        q.ministerName,
        parliamentId,
        config.governmentParties,
        q.questionText
      );
      classifiedQuestions.push({ ...q, ...cls });
    }

    const realQuestions = classifiedQuestions.filter((q) => !q.isDorothyDixer);
    const dixerCount = classifiedQuestions.length - realQuestions.length;
    console.log(`Questions: ${realQuestions.length} real, ${dixerCount} Dorothy Dixers`);

    // ── Step 6: AI enrichment ─────────────────────────────────────────────────
    console.log("Step 6: AI enrichment...");

    // Sequential to avoid Claude rate limits
    const enrichedBills: Array<{ title: string; party: string | null; summary: string | null }> = [];
    for (const bill of allBills) {
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
      enrichedBills.push({ title: bill.shortTitle, party: null, summary });
    }

    // Sequential to avoid Claude rate limits; skip summary if no answer text available
    const enrichedQuestions: Array<{ asker: string; minister: string; subject: string | null; summary: string | null }> = [];
    for (const q of classifiedQuestions) {
      let aiSummary: string | null = null;

      if (!q.isDorothyDixer && q.answerText) {
        await new Promise((r) => setTimeout(r, 1000)); // avoid Claude rate limits
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

      const { error } = await db.from("questions").upsert(
        {
          sitting_day_id: sittingDayId,
          question_number: q.questionNumber,
          asker_id: q.askerMemberId,
          minister_id: q.ministerMemberId,
          subject: q.subject,
          question_text: q.questionText,
          answer_text: q.answerText,
          is_dorothy_dixer: q.isDorothyDixer,
          ai_summary: aiSummary,
          asker_name: q.askerName,
          asker_party: q.askerParty ? (FEDERAL_PARTIES[q.askerParty]?.short_name ?? q.askerParty) : null,
          minister_name: q.ministerName,
          minister_party: (() => {
            // Prefer OA party string (normalised); fall back to member record party
            if (q.ministerParty) return FEDERAL_PARTIES[q.ministerParty]?.short_name ?? q.ministerParty;
            if (q.ministerMemberId) {
              const m = (members ?? []).find((m) => m.id === q.ministerMemberId);
              const party = m?.parties as unknown as { short_name: string } | null;
              return party?.short_name ?? null;
            }
            return null;
          })(),
        },
        { onConflict: "sitting_day_id,question_number" }
      );
      if (error) console.warn(`Question upsert error: ${error.message}`);
      enrichedQuestions.push({ asker: q.askerName ?? "", minister: q.ministerName ?? "", subject: q.subject, summary: aiSummary });
    }

    // ── Step 7: Daily digest ──────────────────────────────────────────────────
    console.log("Step 7: Generating daily digest...");
    const divisionSummaries = divisions.map((d) => ({
      subject: d.name,
      result: d.outcome,
      ayes: d.aye_votes,
      noes: d.no_votes,
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
