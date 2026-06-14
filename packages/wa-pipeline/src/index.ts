/**
 * WA Parliament pipeline
 *
 * Usage:
 *   ts-node src/index.ts [--parliament wa_la|wa_lc] [--date YYYY-MM-DD] [--members-only] [--skip-audio] [--force]
 */

import { db } from "./db/client";
import { syncWAMembers } from "./scrapers/wa-members";
import { fetchQuestionsWithoutNotice, fetchGalleryListings, type WAChamber } from "./scrapers/wa-gallery";
import { fetchVideoMeta } from "./scrapers/wa-video";
import { downloadHlsAudio } from "./audio/downloader";
import { uploadEpisode, uploadQuestionClip, uploadChapters, uploadDebateClip } from "./audio/uploader";
import { fetchChapterCaptions, renderTranscript } from "./audio/captions";
import { buildEpisode, embedChapters, type QuestionSegment } from "./audio/editor";
import { timestampWAQuestions } from "./ai/timestamp-questions";
import { getAudioDuration } from "./audio/duration";
import { summariseWAQuestion } from "./ai/summarise";
import { summariseWADay } from "./ai/summarise-day";
import { summariseWADebate } from "./ai/summarise-debate";
import { parseTocDebates, parseDebateXML, type ProceedingType } from "./parsers/debate";
import { WA_PARLIAMENTS, WA_GOVERNMENT_PARTIES, WAParliamentId, partyById } from "./config";
import { detectWADorothyDixer } from "./ai/detect-dixer";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Hansard helpers (inline — same logic as apps/web/app/wa/lib/hansard.ts)
// ---------------------------------------------------------------------------

interface WAQuestion {
  number: number;
  subject: string;
  asker: string;
  minister: string;
  answerer: string;
  questionText: string;
  answerText: string;
}

const HANSARD_BASE = "https://www.parliament.wa.gov.au";
const CHAMBER_PATH: Record<WAParliamentId, string> = {
  wa_la: "lh",
  wa_lc: "uh",
};

async function fetchTocHtml(parliamentId: WAParliamentId, date: string): Promise<string | null> {
  const chamber = CHAMBER_PATH[parliamentId];
  const res = await fetch(`${HANSARD_BASE}/hansard/daily/${chamber}/${date}/`);
  if (!res.ok) return null;
  return res.text();
}

async function fetchSectionXML(parliamentId: WAParliamentId, date: string, section: number): Promise<string | null> {
  const chamber = CHAMBER_PATH[parliamentId];
  const res = await fetch(`${HANSARD_BASE}/hansard/daily/${chamber}/${date}/extract/${section}/download`);
  if (!res.ok) return null;
  return res.text();
}

async function fetchQWNSections(parliamentId: WAParliamentId, date: string): Promise<number[]> {
  const html = await fetchTocHtml(parliamentId, date);
  if (!html) return [];

  const lower = html.toLowerCase();
  const marker = "questions without notice";
  const sectionRe = /\/hansard\/daily\/(?:lh|uh)\/[\d-]+\/(\d+)/g;
  const sections: number[] = [];

  // The TOC can contain several "Questions without notice" items: the real
  // QWN proceedings, but also "Questions without Notice—Answers" (tabled
  // answers to earlier questions). Scan every occurrence, skip the Answers
  // variants, and collect sections from each real block — non-question
  // sections parse to zero questions downstream, so over-collecting is safe.
  let searchFrom = 0;
  while (true) {
    const idx = lower.indexOf(marker, searchFrom);
    if (idx === -1) break;
    searchFrom = idx + marker.length;
    const tail = lower.slice(idx + marker.length, idx + marker.length + 16);
    if (tail.startsWith("—answers") || tail.startsWith("&#x2014;answers") || tail.startsWith("&mdash;answers")) continue;
    // The block runs until the next proceeding's TOC button — QWN lists can
    // be long, so a fixed window truncates later questions.
    const blockEnd = lower.indexOf("btn-toc-procexpander", idx + marker.length);
    const block = html.slice(idx, blockEnd === -1 ? idx + 60000 : blockEnd);
    let m: RegExpExecArray | null;
    while ((m = sectionRe.exec(block)) !== null) {
      const n = parseInt(m[1], 10);
      if (!sections.includes(n)) sections.push(n);
    }
    sectionRe.lastIndex = 0;
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
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    // Hansard tab-delimits numbered sub-questions: "(1)\tWhat was…".
    // Break each onto its own line so transcripts render as a list.
    .replace(/(\(\d+\)(?:\s*[–—-]\s*\(\d+\))?)\t/g, "\n$1 ")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

function parseQuestionsXML(xml: string): WAQuestion[] {
  const questions: WAQuestion[] = [];
  const subjectMatch = xml.match(/<subject[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const subject = subjectMatch ? stripTags(subjectMatch[1]).trim() : "";

  const talkerRe = /<talker[^>]*>([\s\S]*?)<\/talker>/g;
  const talkers: { kind: string; name: string; qonNum: number | null; directedTo: string; text: string }[] = [];
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
    // The header line ("453. Hon Nick Goiran to the parliamentary secretary
    // representing the Attorney General:") names who the question is directed
    // to; it's excluded from the transcript text below.
    const headerLine = allTexts.map((t) => stripTags(t).trim()).find((t) => /^\d+\./.test(t));
    const dirMatch = headerLine?.match(/\bto the\s+(.+?)\s*:?\s*$/i);
    const contentTexts = allTexts.filter((t) => !/^\s*\d+\./.test(stripTags(t)));
    const text = contentTexts.map((t) => stripTags(t).trim()).filter(Boolean).join("\n");
    talkers.push({
      kind: kindMatch?.[1] ?? "",
      name: nameMatch ? stripTags(nameMatch[1]).trim() : "",
      qonNum: qonMatch ? parseInt(qonMatch[1], 10) : null,
      directedTo: dirMatch ? `the ${dirMatch[1]}` : "",
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
      minister: t.directedTo || (toMatch ? `the ${toMatch[2]}` : ""),
      answerer: answer?.name ?? "",
      questionText: t.text,
      answerText: answer?.text ?? "",
    });
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Member ID resolution
// ---------------------------------------------------------------------------

async function resolveMember(
  lastName: string,
  parliamentId: WAParliamentId
): Promise<{ id: string; party_id: string | null } | null> {
  const { data } = await db
    .from("members")
    .select("id, party_id")
    .eq("parliament_id", parliamentId)
    .ilike("name_last", lastName.trim())
    .limit(1)
    .maybeSingle();
  return (data as { id: string; party_id: string | null } | null) ?? null;
}

// ---------------------------------------------------------------------------
// Debates (grievances, ministerial statements, member statements)
// ---------------------------------------------------------------------------

interface DebateSpeechRow {
  speaker: string;
  member_id: string | null;
  party_short: string | null;
  party_colour: string | null;
  text: string;
}

const GALLERY_CATEGORY: Record<ProceedingType, string> = {
  grievance: "Grievance",
  ministerial_statement: "Ministerial Statement",
  member_statement: "Member Statement",
};

/** Normalise a title for matching Hansard subjects against gallery card titles. */
function normTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‒-―‘’“”]/g, " ") // dashes & smart quotes
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptText(speeches: DebateSpeechRow[]): string {
  return speeches.map((s) => `${s.speaker}: ${s.text}`).join("\n");
}

/**
 * Process debate proceedings for a sitting day: enumerate grievance/ministerial/
 * member-statement sections from the TOC, parse each section's speeches, resolve
 * speakers to members, AI-summarise, and attach the matching gallery audio clip
 * (each is a pre-trimmed chapter of the day's broadcast — no splitting needed).
 */
async function processDebates(
  parliamentId: WAParliamentId,
  date: string,
  sittingDayId: number,
  skipAudio: boolean
) {
  const html = await fetchTocHtml(parliamentId, date);
  if (!html) { console.log("  No TOC — skipping debates"); return; }
  const tocDebates = parseTocDebates(html);
  if (tocDebates.length === 0) { console.log("  No debate sections found"); return; }
  console.log(`  Found ${tocDebates.length} debate section(s)`);

  // Snapshot existing rows so re-runs reuse summaries/audio when content is unchanged.
  const { data: priorRows } = await db
    .from("debates")
    .select("hansard_section, ai_summary, transcript_json, audio_clip_url")
    .eq("sitting_day_id", sittingDayId);
  const priorBySection = new Map(
    ((priorRows ?? []) as { hansard_section: number; ai_summary: string | null; transcript_json: DebateSpeechRow[] | null; audio_clip_url: string | null }[])
      .map((r) => [r.hansard_section, r])
  );

  // Parse + resolve + upsert each debate section.
  type Parsed = { section: number; type: ProceedingType; subject: string; speeches: DebateSpeechRow[] };
  const parsed: Parsed[] = [];
  let seq = 0;
  for (const d of tocDebates) {
    const xml = await fetchSectionXML(parliamentId, date, d.section);
    if (!xml) continue;
    const rawSpeeches = parseDebateXML(xml);
    if (rawSpeeches.length === 0) continue;

    const speeches: DebateSpeechRow[] = [];
    for (const s of rawSpeeches) {
      const lastName = s.speaker.split(/\s+/).pop() ?? s.speaker;
      const member = await resolveMember(lastName, parliamentId);
      const party = partyById(member?.party_id ?? null);
      speeches.push({
        speaker: s.speaker,
        member_id: member?.id ?? null,
        party_short: party?.short_name ?? null,
        party_colour: party?.colour_hex ?? null,
        text: s.text,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).from("debates").upsert({
      sitting_day_id: sittingDayId,
      hansard_section: d.section,
      proceeding_type: d.type,
      sequence: seq++,
      title: d.subject,
      transcript_json: speeches,
    }, { onConflict: "sitting_day_id,hansard_section" });
    if (error) throw new Error(`Debate upsert failed (s${d.section}): ${error.message}`);
    parsed.push({ section: d.section, type: d.type, subject: d.subject, speeches });
  }

  // Remove stale debate rows from earlier runs (guarded on a non-empty parse).
  const freshSections = parsed.map((p) => p.section);
  if (freshSections.length > 0) {
    await db.from("debates").delete()
      .eq("sitting_day_id", sittingDayId)
      .not("hansard_section", "in", `(${freshSections.join(",")})`);
  }
  console.log(`  Stored ${parsed.length} debate(s)`);

  // AI summaries — reuse the prior summary when the transcript is unchanged.
  for (const d of parsed) {
    const prior = priorBySection.get(d.section);
    const unchanged = prior?.transcript_json
      ? transcriptText(prior.transcript_json) === transcriptText(d.speeches)
      : false;
    if (prior?.ai_summary && unchanged) continue;
    try {
      const summary = await summariseWADebate({ type: d.type, title: d.subject, speeches: d.speeches });
      await db.from("debates").update({ ai_summary: summary })
        .eq("sitting_day_id", sittingDayId).eq("hansard_section", d.section);
      console.log(`  s${d.section}: summarised`);
    } catch (err) {
      console.warn(`  s${d.section}: debate summary failed (non-fatal):`, err);
    }
  }

  if (skipAudio) return;

  // Audio — each debate maps to a gallery chapter (pre-trimmed to one proceeding).
  const chamberKey: WAChamber = parliamentId === "wa_la" ? "assembly" : "council";

  // Resolve a gallery video (uuid + chapter) per debate section. The Assembly
  // gallery titles each card with its subject (match by normalised title); the
  // Council labels every card generically ("Member statement"), so when titles
  // don't disambiguate we fall back to positional matching — only when the
  // count of still-unmatched debates equals the count of unused videos, pairing
  // them in chronological order (section ↔ chapter).
  const videoBySection = new Map<number, { uuid: string; chapter: number | null }>();
  const byType = new Map<ProceedingType, Parsed[]>();
  for (const d of parsed) {
    const list = byType.get(d.type) ?? [];
    list.push(d);
    byType.set(d.type, list);
  }

  for (const [type, debs] of byType) {
    let listings: Awaited<ReturnType<typeof fetchGalleryListings>>;
    try {
      listings = (await fetchGalleryListings(chamberKey, GALLERY_CATEGORY[type])).filter((l) => l.date === date);
    } catch (err) {
      console.warn(`  Gallery fetch failed for ${GALLERY_CATEGORY[type]} (non-fatal):`, err);
      continue;
    }

    // 1. Title match. Skip generic cards whose title is just the category name.
    const genericTitle = normTitle(GALLERY_CATEGORY[type]);
    const titleIndex = new Map<string, { uuid: string; chapter: number | null }>();
    for (const l of listings) {
      const k = normTitle(l.title);
      if (k && k !== genericTitle) titleIndex.set(k, { uuid: l.uuid, chapter: l.chapter });
    }
    const usedChapters = new Set<number | null>();
    const unmatched: Parsed[] = [];
    for (const d of debs) {
      const key = normTitle(d.subject);
      let m = titleIndex.get(key);
      if (!m) {
        // Substring fallback — gallery and Hansard titles occasionally differ slightly.
        for (const [gk, gv] of titleIndex) {
          if (gk.includes(key) || key.includes(gk)) { m = gv; break; }
        }
      }
      if (m) { videoBySection.set(d.section, m); usedChapters.add(m.chapter); }
      else unmatched.push(d);
    }

    // 2. Positional fallback (generic-title galleries, e.g. the Council).
    const free = listings
      .filter((l) => !usedChapters.has(l.chapter))
      .sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
    if (unmatched.length > 0 && unmatched.length === free.length) {
      unmatched.sort((a, b) => a.section - b.section);
      unmatched.forEach((d, i) => videoBySection.set(d.section, { uuid: free[i].uuid, chapter: free[i].chapter }));
      console.log(`  ${GALLERY_CATEGORY[type]}: matched ${free.length} clip(s) by order (generic gallery titles)`);
    }
  }

  const outputDir = path.join(os.tmpdir(), `on-notice-wa-${date}-${parliamentId}-debates`);
  for (const d of parsed) {
    const prior = priorBySection.get(d.section);
    const unchanged = prior?.transcript_json
      ? transcriptText(prior.transcript_json) === transcriptText(d.speeches)
      : false;
    if (prior?.audio_clip_url && unchanged) continue;

    const match = videoBySection.get(d.section);
    if (!match) continue; // no gallery video → debate stays text-only

    try {
      const meta = await fetchVideoMeta(match.uuid, match.chapter);
      const clipPath = await downloadHlsAudio(meta.audioUrl, outputDir, `debate-${d.section}.mp3`);
      const clipUrl = await uploadDebateClip(clipPath, parliamentId, date, d.section);
      const durationSec = await getAudioDuration(clipPath);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("debates").update({
        audio_clip_url: clipUrl,
        audio_duration_sec: durationSec,
        gallery_chapter: match.chapter,
      }).eq("sitting_day_id", sittingDayId).eq("hansard_section", d.section);
      console.log(`  s${d.section}: audio attached (ch ${match.chapter})`);
    } catch (err) {
      console.warn(`  s${d.section}: audio failed (non-fatal):`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Site revalidation
// ---------------------------------------------------------------------------

async function revalidateSite(parliamentId: WAParliamentId, date: string) {
  const appUrl = process.env.APP_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!appUrl || !secret) return;
  try {
    const res = await fetch(`${appUrl}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-token": secret },
      body: JSON.stringify({ date, parliament: parliamentId }),
    });
    if (res.ok) console.log("  Site revalidated");
    else console.warn(`  Revalidation returned ${res.status} (non-fatal)`);
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
  const force = args.includes("--force");

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

  // Idempotency / catch-up guard.
  // The nightly job re-attempts the last few days (WA Hansard often indexes a
  // sitting day a day or more after it happens, after our morning run). Days
  // already fully processed exit here cheaply so the loop costs almost nothing.
  // Use --force to reprocess a complete day.
  if (!force && !membersOnly) {
    const { data: existing } = await db
      .from("sitting_days")
      .select("pipeline_status")
      .eq("parliament_id", parliamentId)
      .eq("sitting_date", date)
      .maybeSingle();
    if ((existing as { pipeline_status?: string } | null)?.pipeline_status === "complete") {
      console.log(`${date} already complete — skipping (use --force to reprocess).`);
      return;
    }
  }

  // 1. Sync members
  console.log("Step 1: Syncing members...");
  try {
    await syncWAMembers();
  } catch (err) {
    if (membersOnly) throw err;
    // parliament.wa.gov.au sometimes 403s GitHub Actions IPs. Members change
    // rarely and are synced weekly, so a failure here is non-fatal — carry on
    // with whoever is already in the DB.
    console.warn(`  Member sync failed (non-fatal): ${(err as Error).message} — continuing with existing members`);
  }
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

  // Snapshot existing rows *before* the upsert overwrites them. WA Hansard
  // renumbers qonNums between runs, so a question_number can point at entirely
  // different text on this run than it did last time. We key summary reuse off
  // the text that was actually summarised, not the (unstable) number — see 5b.
  const { data: priorRows } = await db
    .from("questions")
    .select("question_number, ai_summary, question_text, answer_text")
    .eq("sitting_day_id", sittingDayId);
  const priorByNumber = new Map(
    ((priorRows ?? []) as { question_number: number; ai_summary: string | null; question_text: string | null; answer_text: string | null }[])
      .map((r) => [r.question_number, r])
  );

  // 5. Resolve member IDs, classify Dorothy Dixers, and upsert questions
  console.log("\nStep 5: Storing questions...");
  let dixerCount = 0;
  const dixerByNumber = new Map<number, boolean>();
  for (const q of allQuestions) {
    const askerLastName = q.asker.split(/\s+/).pop() ?? q.asker;
    const asker = await resolveMember(askerLastName, parliamentId);
    const answererLastName = q.answerer ? q.answerer.split(/\s+/).pop() : null;
    const ministerMember = answererLastName ? await resolveMember(answererLastName, parliamentId) : null;

    // QWN answers always come from government ministers, so a government-party
    // asker means a staged question. AI fallback when the asker is unknown.
    let isDixer: boolean;
    if (asker?.party_id) {
      isDixer = WA_GOVERNMENT_PARTIES.includes(asker.party_id);
    } else {
      isDixer = await detectWADorothyDixer({
        askerName: q.asker,
        ministerName: q.minister,
        questionText: q.questionText,
      }).catch((err) => {
        console.warn(`  Q${q.number}: dixer detection failed (non-fatal):`, err);
        return false;
      });
    }
    if (isDixer) dixerCount++;
    dixerByNumber.set(q.number, isDixer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: qErr } = await (db as any).from("questions").upsert({
      sitting_day_id: sittingDayId,
      question_number: q.number,
      asker_id: asker?.id ?? null,
      subject: q.subject,
      question_text: q.questionText,
      answer_text: q.answerText,
      minister_name: q.minister || null,
      minister_id: ministerMember?.id ?? null,
      is_dorothy_dixer: isDixer,
    }, { onConflict: "sitting_day_id,question_number" });
    if (qErr) throw new Error(`Question upsert failed (Q${q.number}): ${qErr.message}`);
  }

  // Remove stale questions from earlier runs. WA Hansard renumbers qonNums as
  // the daily record is revised, so a question captured as e.g. Q337 on an
  // early run can reappear as Q338 later — leaving the upsert-only loop above
  // with an orphan duplicate. Delete any rows for this day not in the fresh
  // parse. Guarded on a non-empty parse so a fetch failure never wipes the day.
  const freshNumbers = allQuestions.map((q) => q.number);
  if (freshNumbers.length > 0) {
    const { data: stale } = await db
      .from("questions")
      .select("question_number")
      .eq("sitting_day_id", sittingDayId)
      .not("question_number", "in", `(${freshNumbers.join(",")})`);
    const staleNumbers = (stale ?? []).map((s) => (s as { question_number: number }).question_number);
    if (staleNumbers.length > 0) {
      await db.from("questions").delete().eq("sitting_day_id", sittingDayId).in("question_number", staleNumbers);
      console.log(`  Removed ${staleNumbers.length} stale question(s): Q${staleNumbers.join(", Q")}`);
    }
  }
  console.log(`  Stored ${allQuestions.length} questions (${allQuestions.length - dixerCount} real, ${dixerCount} Dorothy Dixers)`);

  // 5b. AI summaries
  console.log("\nStep 5b: Generating AI summaries...");
  // Questions summarised on a previous run keep their summary — re-runs
  // (e.g. --force after a parser fix) only spend AI on new questions. Reuse is
  // gated on the summarised text being unchanged: because Hansard renumbers
  // qonNums between runs, a question_number whose text now differs from what we
  // previously stored is a *different* question, and its old summary is stale.
  const enrichedQuestions: Array<{ asker: string; minister: string; subject: string | null; summary: string | null }> = [];
  for (const q of allQuestions) {
    if (!q.questionText && !q.answerText) continue;
    const prior = priorByNumber.get(q.number);
    const textUnchanged =
      (prior?.question_text ?? "") === (q.questionText ?? "") &&
      (prior?.answer_text ?? "") === (q.answerText ?? "");
    if (prior?.ai_summary && textUnchanged) {
      enrichedQuestions.push({ asker: q.asker, minister: q.minister, subject: q.subject || null, summary: prior.ai_summary });
      continue;
    }
    try {
      const summary = await summariseWAQuestion({
        askerName: q.asker,
        ministerName: q.minister,
        subject: q.subject || null,
        questionText: q.questionText,
        answerText: q.answerText,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("questions").update({ ai_summary: summary })
        .eq("sitting_day_id", sittingDayId)
        .eq("question_number", q.number);
      enrichedQuestions.push({ asker: q.asker, minister: q.minister, subject: q.subject || null, summary });
      console.log(`  Q${q.number}: summarised`);
    } catch (err) {
      console.warn(`  Q${q.number}: AI summary failed (non-fatal):`, err);
    }
  }

  // 5c. Daily digest
  console.log("\nStep 5c: Generating daily digest...");
  const { data: existingDigest } = await db
    .from("daily_digests")
    .select("id")
    .eq("sitting_day_id", sittingDayId)
    .maybeSingle();
  if (existingDigest) {
    console.log("  Daily digest already exists — skipping");
  } else try {
    const digest = await summariseWADay({
      date,
      chamber: WA_PARLIAMENTS[parliamentId].name,
      questions: enrichedQuestions,
    });
    if (digest.lede || digest.digest) {
      await db.from("daily_digests").upsert(
        {
          sitting_day_id: sittingDayId,
          lede: digest.lede,
          ai_summary: digest.digest,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "sitting_day_id" }
      );
      console.log("  Daily digest stored");
    } else {
      console.log("  Daily digest empty — skipped");
    }
  } catch (err) {
    console.warn("  Daily digest failed (non-fatal):", err);
  }

  // 6. Audio pipeline
  if (!skipAudio) {
    console.log("\nStep 6: Audio pipeline...");
    const chamberKey = parliamentId === "wa_la" ? "assembly" : "council";
    const listings = await fetchQuestionsWithoutNotice(chamberKey);
    const match = listings.find((l) => l.date === date);
    if (!match) {
      console.warn(`  No gallery video dated ${date} — skipping audio (gallery covers ${listings.at(-1)?.date} to ${listings[0]?.date})`);
    } else {
      const meta = await fetchVideoMeta(match.uuid, match.chapter);
      const outputDir = path.join(os.tmpdir(), `on-notice-wa-${date}-${parliamentId}`);
      const audioPath = await downloadHlsAudio(meta.audioUrl, outputDir, "qwn.mp3");
      console.log(`  Audio downloaded: ${audioPath}`);

      // Edit: timestamp each question from the captions, cut per-question
      // clips, and stitch the non-dixer questions into the episode. Falls
      // back to the raw QWN audio if any of it fails.
      let episodePath = audioPath;
      try {
        console.log("  Fetching captions for question timestamping...");
        const captions = await fetchChapterCaptions(meta.hlsUrl);
        const transcript = renderTranscript(captions);

        const timestamps = await timestampWAQuestions(
          transcript,
          allQuestions.map((q) => ({
            questionNumber: q.number,
            askerName: q.asker,
            ministerName: q.minister,
            questionText: q.questionText,
            isDorothyDixer: dixerByNumber.get(q.number) ?? false,
          }))
        );
        console.log(`  Timestamped ${timestamps.length}/${allQuestions.length} questions`);
        if (timestamps.length === 0) throw new Error("no questions timestamped");

        const segments: QuestionSegment[] = timestamps.map((t) => ({
          questionNumber: t.questionNumber,
          startSec: t.startSec,
          endSec: t.endSec,
          includeInPodcast: !(dixerByNumber.get(t.questionNumber) ?? false),
        }));
        const episode = await buildEpisode(
          audioPath,
          segments,
          path.join(outputDir, "episode.mp3"),
          outputDir
        );
        episodePath = episode.path;
        const cut = segments.filter((s) => s.includeInPodcast === false).length;
        console.log(`  Episode built: ${segments.length - cut} questions, ${cut} Dorothy Dixers cut (${Math.round(episode.durationSec / 60)}m)`);

        // Podcasting 2.0 chapters: one per included question, at its offset in
        // the edited episode. Embedded as ID3 frames (Apple) + uploaded as
        // chapters.json referenced by <podcast:chapters> in the RSS feed.
        const siteUrl = process.env.WA_APP_URL ?? "https://wa.on-notice.xyz";
        const chamberQuery = parliamentId === "wa_lc" ? "?chamber=lc" : "";
        const chapters = segments
          .filter((s) => s.includeInPodcast !== false && episode.chapterStartSecs.has(s.questionNumber))
          .map((s) => {
            const q = allQuestions.find((aq) => aq.number === s.questionNumber);
            const prefix = q?.asker && q?.minister
              ? `${q.asker} → ${q.minister}: `
              : q?.asker
                ? `${q.asker}: `
                : "";
            return {
              startTime: episode.chapterStartSecs.get(s.questionNumber)!,
              title: q?.subject
                ? `Q${s.questionNumber}: ${prefix}${q.subject}`
                : `Question ${s.questionNumber}`,
              url: `${siteUrl}/${date}${chamberQuery}`,
            };
          });

        if (chapters.length > 0) {
          await embedChapters(episodePath, chapters, episode.durationSec, outputDir);
          const chaptersFilePath = path.join(outputDir, "chapters.json");
          fs.writeFileSync(chaptersFilePath, JSON.stringify({ version: "1.2.0", chapters }));
          await uploadChapters(chaptersFilePath, parliamentId, date);
          console.log(`  Chapters: ${chapters.length} embedded + uploaded`);
        }

        for (const [num, clipPath] of episode.clipPaths) {
          const clipUrl = await uploadQuestionClip(clipPath, parliamentId, date, num);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).from("questions")
            .update({ audio_clip_url: clipUrl })
            .eq("sitting_day_id", sittingDayId)
            .eq("question_number", num);
        }
        console.log(`  Uploaded ${episode.clipPaths.size} question clips`);
      } catch (err) {
        console.warn("  Audio editing failed (non-fatal) — using raw QWN audio:", err);
      }

      const audioUrl = await uploadEpisode(episodePath, parliamentId, date);
      console.log(`  Uploaded to R2: ${audioUrl}`);

      const durationSec = await getAudioDuration(episodePath);
      if (durationSec) console.log(`  Duration: ${Math.round(durationSec / 60)}m`);

      // Update sitting day with audio URL and metadata
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from("sitting_days").update({
        audio_source_url: meta.hlsUrl,
        audio_url: audioUrl,
        audio_duration_sec: durationSec,
        hansard_url: `${HANSARD_BASE}/hansard/daily/${CHAMBER_PATH[parliamentId]}/${date}/`,
        pipeline_status: "complete",
      }).eq("id", sittingDayId);
    }
  } else {
    await db.from("sitting_days").update({ pipeline_status: "complete" }).eq("id", sittingDayId);
  }

  // 7. Debates (grievances, ministerial + member statements)
  console.log("\nStep 7: Processing debates...");
  try {
    await processDebates(parliamentId, date, sittingDayId, skipAudio);
  } catch (err) {
    console.warn("  Debate processing failed (non-fatal):", err);
  }

  // 8. Revalidate site
  await revalidateSite(parliamentId, date);
  console.log("\n=== WA Pipeline complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
