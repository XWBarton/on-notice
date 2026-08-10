/**
 * Audio-only backfill: re-cut and re-upload the podcast episode + per-question
 * clips + chapters for WA sitting days, without touching questions, summaries,
 * or debates.
 *
 * Why this exists: the episode editor changed (consecutive non-Dixer questions
 * now butt-join with no fade/overlap — see audio/editor.ts). Old episodes were
 * stitched with the previous logic. Reproducing the new editing needs a fresh
 * cut from the *raw* gallery broadcast (the stored per-question clips are
 * already faded/buffered, so re-concatenating them can't reproduce it). This
 * re-downloads the raw QWN audio (cached per day in tmp), re-timestamps, and
 * re-runs buildEpisode — the same audio path as the nightly run, nothing else.
 *
 * Re-timestamping costs one AI call per day per chamber (the per-question
 * boundaries aren't persisted, only the resulting clip URLs).
 *
 * Usage:
 *   ts-node src/scripts/backfill-audio.ts                       # all WA days
 *   ts-node src/scripts/backfill-audio.ts --date 2026-06-11     # one date (both chambers)
 *   ts-node src/scripts/backfill-audio.ts --parliament wa_la    # one chamber, all days
 *   ts-node src/scripts/backfill-audio.ts --from 2026-04-01     # days on/after a date
 */
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { db } from "../db/client";
import { fetchQuestionsWithoutNotice } from "../scrapers/wa-gallery";
import { fetchVideoMeta } from "../scrapers/wa-video";
import { downloadHlsAudio } from "../audio/downloader";
import { fetchChapterCaptions, renderTranscript } from "../audio/captions";
import { timestampWAQuestions } from "../ai/timestamp-questions";
import { buildEpisode, embedChapters, type QuestionSegment } from "../audio/editor";
import { uploadEpisode, uploadQuestionClip, uploadChapters } from "../audio/uploader";
import { getAudioDuration } from "../audio/duration";
import { WAParliamentId } from "../config";

interface DBQuestion {
  question_number: number;
  subject: string | null;
  minister_name: string | null;
  asker_id: string | null;
  question_text: string | null;
  is_dorothy_dixer: boolean | null;
}

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function processDay(sittingDayId: string, parliamentId: WAParliamentId, date: string) {
  console.log(`\n── ${date} (${parliamentId}) ──`);

  const { data: qs } = await db
    .from("questions")
    .select("question_number, subject, minister_name, asker_id, question_text, is_dorothy_dixer")
    .eq("sitting_day_id", sittingDayId)
    .order("question_number");
  const questions = (qs ?? []) as DBQuestion[];
  if (questions.length === 0) {
    console.warn("  No questions — skipping");
    return;
  }

  // Resolve asker display names in one query (the timestamper matches on them).
  const askerIds = [...new Set(questions.map((q) => q.asker_id).filter(Boolean) as string[])];
  const askerName = new Map<string, string>();
  if (askerIds.length > 0) {
    const { data: members } = await db
      .from("members")
      .select("id, name_first, name_last")
      .in("id", askerIds);
    for (const m of (members ?? []) as { id: string; name_first: string | null; name_last: string | null }[]) {
      askerName.set(m.id, [m.name_first, m.name_last].filter(Boolean).join(" ").trim());
    }
  }
  const nameOf = (q: DBQuestion) => (q.asker_id ? askerName.get(q.asker_id) ?? "" : "");

  // Locate the day's gallery broadcast.
  const chamberKey = parliamentId === "wa_la" ? "assembly" : "council";
  const listings = await fetchQuestionsWithoutNotice(chamberKey);
  const match = listings.find((l) => l.date === date);
  if (!match) {
    console.warn(`  No gallery video dated ${date} — skipping (gallery covers ${listings.at(-1)?.date} to ${listings[0]?.date})`);
    return;
  }

  const meta = await fetchVideoMeta(match.uuid, match.chapter);
  const outputDir = path.join(os.tmpdir(), `on-notice-wa-${date}-${parliamentId}`);
  const audioPath = await downloadHlsAudio(meta.audioUrl, outputDir, "qwn.mp3");

  const captions = await fetchChapterCaptions(meta.hlsUrl);
  const transcript = renderTranscript(captions);
  const timestamps = await timestampWAQuestions(
    transcript,
    questions.map((q) => ({
      questionNumber: q.question_number,
      askerName: nameOf(q),
      ministerName: q.minister_name ?? "",
      questionText: q.question_text ?? "",
      isDorothyDixer: Boolean(q.is_dorothy_dixer),
    }))
  );
  console.log(`  Timestamped ${timestamps.length}/${questions.length} questions`);
  if (timestamps.length === 0) {
    console.warn("  Nothing timestamped — skipping");
    return;
  }

  const dixerByNumber = new Map(questions.map((q) => [q.question_number, Boolean(q.is_dorothy_dixer)]));
  const segments: QuestionSegment[] = timestamps.map((t) => ({
    questionNumber: t.questionNumber,
    startSec: t.startSec,
    endSec: t.endSec,
    includeInPodcast: !(dixerByNumber.get(t.questionNumber) ?? false),
  }));

  const episode = await buildEpisode(audioPath, segments, path.join(outputDir, "episode.mp3"), outputDir);
  const cut = segments.filter((s) => s.includeInPodcast === false).length;
  console.log(`  Episode rebuilt: ${segments.length - cut} questions, ${cut} Dorothy Dixers cut (${Math.round(episode.durationSec / 60)}m)`);

  // Chapters — one per included question, at its offset in the edited episode.
  const siteUrl = process.env.WA_APP_URL ?? "https://wa.on-notice.xyz";
  const chamberQuery = parliamentId === "wa_lc" ? "?chamber=lc" : "";
  const chapters = segments
    .filter((s) => s.includeInPodcast !== false && episode.chapterStartSecs.has(s.questionNumber))
    .map((s) => {
      const q = questions.find((aq) => aq.question_number === s.questionNumber);
      const asker = q ? nameOf(q) : "";
      const prefix = asker && q?.minister_name ? `${asker} → ${q.minister_name}: ` : asker ? `${asker}: ` : "";
      return {
        startTime: episode.chapterStartSecs.get(s.questionNumber)!,
        title: q?.subject ? `Q${s.questionNumber}: ${prefix}${q.subject}` : `Question ${s.questionNumber}`,
        url: `${siteUrl}/${date}${chamberQuery}`,
      };
    });

  let episodePath = episode.path;
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
    await (db as any).from("questions").update({ audio_clip_url: clipUrl })
      .eq("sitting_day_id", sittingDayId).eq("question_number", num);
  }
  console.log(`  Uploaded ${episode.clipPaths.size} question clips`);

  const audioUrl = await uploadEpisode(episodePath, parliamentId, date);
  const durationSec = await getAudioDuration(episodePath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from("sitting_days").update({
    audio_url: audioUrl,
    audio_duration_sec: durationSec,
  }).eq("id", sittingDayId);
  console.log(`  Uploaded episode → ${audioUrl}`);
}

async function main() {
  const dateArg = argVal("--date");
  const fromArg = argVal("--from");
  const parliamentArg = argVal("--parliament") as WAParliamentId | undefined;

  let q = db
    .from("sitting_days")
    .select("id, sitting_date, parliament_id")
    .like("parliament_id", "wa_%")
    .not("audio_url", "is", null)
    .order("sitting_date");
  if (dateArg) q = q.eq("sitting_date", dateArg);
  if (fromArg) q = q.gte("sitting_date", fromArg);
  if (parliamentArg) q = q.eq("parliament_id", parliamentArg);

  const { data: days, error } = await q;
  if (error) throw new Error(`Failed to load sitting days: ${error.message}`);
  const rows = (days ?? []) as { id: string; sitting_date: string; parliament_id: WAParliamentId }[];
  if (rows.length === 0) {
    console.log("No matching WA sitting days with audio found.");
    return;
  }
  console.log(`Re-cutting ${rows.length} sitting day(s)...`);

  let ok = 0;
  for (const d of rows) {
    try {
      await processDay(d.id, d.parliament_id, d.sitting_date);
      ok++;
    } catch (err) {
      console.warn(`  ${d.sitting_date} (${d.parliament_id}) failed (non-fatal):`, err);
    }
  }
  console.log(`\nDone. Rebuilt ${ok}/${rows.length} day(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
