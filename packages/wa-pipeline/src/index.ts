/**
 * WA Parliament pipeline
 *
 * Usage:
 *   ts-node src/index.ts [--parliament wa_la|wa_lc] [--date YYYY-MM-DD] [--members-only] [--skip-audio]
 */

import { db } from "./db/client";
import { syncWAMembers } from "./scrapers/wa-members";
import { fetchQuestionsWithoutNotice } from "./scrapers/wa-gallery";
import { fetchVideoMeta } from "./scrapers/wa-video";
import { downloadHlsAudio } from "./audio/downloader";
import { WAParliamentId } from "./config";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Hansard helpers (inline — same logic as apps/web/app/wa/lib/hansard.ts)
// ---------------------------------------------------------------------------

interface WAQuestion {
  number: number;
  subject: string;
  asker: string;
  minister: string;
  questionText: string;
  answerText: string;
}

const HANSARD_BASE = "https://www.parliament.wa.gov.au";
const CHAMBER_PATH: Record<WAParliamentId, string> = {
  wa_la: "lh",
  wa_lc: "uh",
};

async function fetchQWNSections(parliamentId: WAParliamentId, date: string): Promise<number[]> {
  const chamber = CHAMBER_PATH[parliamentId];
  const res = await fetch(`${HANSARD_BASE}/hansard/daily/${chamber}/${date}/`);
  if (!res.ok) return [];
  const html = await res.text();

  const lower = html.toLowerCase();
  const idx = lower.indexOf("questions without notice");
  if (idx === -1) return [];
  const block = html.slice(idx, idx + 8000);

  const sectionRe = /\/hansard\/daily\/(?:lh|uh)\/[\d-]+\/(\d+)/g;
  const sections: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(block)) !== null) {
    const n = parseInt(m[1], 10);
    if (!sections.includes(n)) sections.push(n);
  }
  return sections;
}

async function fetchSectionQuestions(parliamentId: WAParliamentId, date: string, section: number): Promise<WAQuestion[]> {
  const chamber = CHAMBER_PATH[parliamentId];
  const res = await fetch(`${HANSARD_BASE}/hansard/daily/${chamber}/${date}/extract/${section}/download`);
  if (!res.ok) return [];
  const xml = await res.text();
  return parseQuestionsXML(xml);
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ");
}

function parseQuestionsXML(xml: string): WAQuestion[] {
  const questions: WAQuestion[] = [];
  const subjectMatch = xml.match(/<subject[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const subject = subjectMatch ? stripTags(subjectMatch[1]).trim() : "";

  const talkerRe = /<talker[^>]*>([\s\S]*?)<\/talker>/g;
  const talkers: { kind: string; name: string; qonNum: number | null; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = talkerRe.exec(xml)) !== null) {
    const block = m[1];
    const kindMatch = m[0].match(/kind="([^"]+)"/);
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
    const qonMatch = block.match(/qonNum="(\d+)"/);
    const allTexts: string[] = [];
    const textRe = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(block)) !== null) allTexts.push(tm[1]);
    const contentTexts = allTexts.filter((t) => !/^\s*\d+\./.test(stripTags(t)));
    const text = contentTexts.map((t) => stripTags(t).trim()).filter(Boolean).join(" ");
    talkers.push({
      kind: kindMatch?.[1] ?? "",
      name: nameMatch ? stripTags(nameMatch[1]).trim() : "",
      qonNum: qonMatch ? parseInt(qonMatch[1], 10) : null,
      text,
    });
  }

  for (let i = 0; i < talkers.length; i++) {
    const t = talkers[i];
    if (t.kind !== "question" || t.qonNum === null) continue;
    const answer = talkers[i + 1]?.kind === "answer" ? talkers[i + 1] : null;
    const toMatch = t.name.match(/^(?:Mr|Ms|Mrs|Dr|Hon\.?)\s+(.+?)\s+to\s+the\s+(.+)$/i);
    questions.push({
      number: t.qonNum,
      subject,
      asker: toMatch ? toMatch[1] : t.name,
      minister: toMatch ? toMatch[2] : "",
      questionText: t.text,
      answerText: answer?.text ?? "",
    });
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Member ID resolution
// ---------------------------------------------------------------------------

async function resolveMemberId(lastName: string, parliamentId: WAParliamentId): Promise<string | null> {
  const { data } = await db
    .from("members")
    .select("id")
    .eq("parliament_id", parliamentId)
    .ilike("name_last", lastName.trim())
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Site revalidation
// ---------------------------------------------------------------------------

async function revalidateSite() {
  const appUrl = process.env.APP_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!appUrl || !secret) return;
  try {
    await fetch(`${appUrl}/api/revalidate?secret=${secret}`);
    console.log("  Site revalidated");
  } catch {
    console.warn("  Revalidation request failed (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const parliamentId: WAParliamentId =
    (args[args.indexOf("--parliament") + 1] as WAParliamentId) ?? "wa_la";
  const membersOnly = args.includes("--members-only");
  const skipAudio = args.includes("--skip-audio");

  // Date: explicit arg or yesterday (WA time, UTC+8)
  let date: string;
  const dateArg = args[args.indexOf("--date") + 1];
  if (dateArg) {
    date = dateArg;
  } else {
    const d = new Date();
    d.setTime(d.getTime() + 8 * 60 * 60 * 1000); // UTC+8
    d.setDate(d.getDate() - 1);
    date = d.toISOString().split("T")[0];
  }

  console.log(`\n=== WA Pipeline: ${parliamentId} / ${date} ===\n`);

  // 1. Sync members
  console.log("Step 1: Syncing members...");
  await syncWAMembers();
  if (membersOnly) { console.log("Members-only mode — done."); return; }

  // 2. Check for sitting day
  console.log(`\nStep 2: Checking for sitting on ${date}...`);
  const sections = await fetchQWNSections(parliamentId, date);
  if (sections.length === 0) {
    console.log("  No Questions Without Notice found — parliament may not have sat.");
    return;
  }
  console.log(`  Found ${sections.length} QWN section(s)`);

  // 3. Upsert sitting day
  console.log("\nStep 3: Upserting sitting day...");
  const { data: sittingDay, error: sdErr } = await db
    .from("sitting_days")
    .upsert(
      { parliament_id: parliamentId, sitting_date: date, pipeline_status: "processing" },
      { onConflict: "parliament_id,sitting_date" }
    )
    .select("id")
    .single();
  if (sdErr || !sittingDay) throw new Error(`Sitting day upsert failed: ${sdErr?.message}`);
  const sittingDayId = sittingDay.id;
  console.log(`  Sitting day ID: ${sittingDayId}`);

  // 4. Parse questions from Hansard
  console.log("\nStep 4: Parsing questions from Hansard...");
  const allQuestions: WAQuestion[] = [];
  for (const section of sections) {
    const qs = await fetchSectionQuestions(parliamentId, date, section);
    allQuestions.push(...qs);
  }
  console.log(`  Found ${allQuestions.length} questions`);

  // 5. Resolve member IDs and upsert questions
  console.log("\nStep 5: Storing questions...");
  for (const q of allQuestions) {
    const askerLastName = q.asker.split(/\s+/).pop() ?? q.asker;
    const askerId = await resolveMemberId(askerLastName, parliamentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: qErr } = await (db as any).from("questions").upsert({
      sitting_day_id: sittingDayId,
      question_number: q.number,
      asker_id: askerId,
      subject: q.subject,
      question_text: q.questionText,
      answer_text: q.answerText,
    }, { onConflict: "sitting_day_id,question_number" });
    if (qErr) throw new Error(`Question upsert failed (Q${q.number}): ${qErr.message}`);
  }
  console.log(`  Stored ${allQuestions.length} questions`);

  // 6. Audio pipeline
  if (!skipAudio) {
    console.log("\nStep 6: Audio pipeline...");
    const chamberKey = parliamentId === "wa_la" ? "assembly" : "council";
    const listings = await fetchQuestionsWithoutNotice(chamberKey);
    const match = listings.find((l) =>
      // Gallery items don't have dates in titles so we take the first (newest) one
      // TODO: match by date once we understand the gallery date format
      true
    );
    if (!match) {
      console.warn("  No video found in gallery — skipping audio");
    } else {
      const meta = await fetchVideoMeta(match.uuid);
      const outputDir = path.join(os.tmpdir(), `on-notice-wa-${date}-${parliamentId}`);
      const audioPath = await downloadHlsAudio(meta.hlsUrl, outputDir, "qwn.mp3");
      console.log(`  Audio downloaded: ${audioPath}`);

      // Update sitting day with audio source
      await db.from("sitting_days").update({
        audio_source_url: meta.hlsUrl,
        hansard_url: `${HANSARD_BASE}/hansard/daily/${CHAMBER_PATH[parliamentId]}/${date}/`,
        pipeline_status: "complete",
      }).eq("id", sittingDayId);
    }
  } else {
    await db.from("sitting_days").update({ pipeline_status: "complete" }).eq("id", sittingDayId);
  }

  // 7. Revalidate site
  await revalidateSite();
  console.log("\n=== WA Pipeline complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
