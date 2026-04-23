/**
 * Backfill podcast episodes from existing per-question clips.
 * Stitches together clips already in R2, embeds ID3 chapters, re-uploads the episode.
 * No raw audio re-download, no AI calls.
 *
 * Usage:
 *   ts-node src/backfill-podcast.ts --parliament fed_hor --date 2026-04-01
 *   ts-node src/backfill-podcast.ts --parliament fed_hor --from 2026-04-01
 *   ts-node src/backfill-podcast.ts --parliament fed_sen --from 2026-04-01
 */

import { execFile } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { db } from "./db/client";
import { concatenateAudio } from "./audio/editor";
import { uploadEpisode, uploadChapters } from "./audio/uploader";

const execFileAsync = promisify(execFile);

async function ffprobeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function downloadClip(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

async function processDay(parliamentId: string, date: string) {
  console.log(`\n── ${date} (${parliamentId}) ──`);

  const { data: sitting, error: sdError } = await db
    .from("sitting_days")
    .select("id")
    .eq("parliament_id", parliamentId)
    .eq("sitting_date", date)
    .single();

  if (sdError || !sitting) {
    console.warn(`  No sitting day found — skipping`);
    return;
  }

  const { data: questions, error: qError } = await db
    .from("questions")
    .select("question_number, subject, asker_name, asker_party, minister_name, minister_party, audio_clip_url")
    .eq("sitting_day_id", sitting.id)
    .eq("is_dorothy_dixer", false)
    .not("audio_clip_url", "is", null)
    .order("question_number");

  if (qError) throw new Error(`Failed to fetch questions: ${qError.message}`);
  if (!questions?.length) {
    console.warn(`  No questions with clips — skipping`);
    return;
  }

  console.log(`  ${questions.length} questions with clips`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `on-notice-backfill-${date}-`));

  try {
    // Download clips and accumulate chapter start times
    const clipPaths: string[] = [];
    const chapterStartSecs = new Map<number, number>();
    let episodePosSec = 0;

    for (const q of questions) {
      const clipPath = path.join(workDir, `q${String(q.question_number).padStart(2, "0")}.mp3`);
      process.stdout.write(`  Downloading Q${q.question_number}... `);
      await downloadClip(q.audio_clip_url!, clipPath);
      const duration = await ffprobeDuration(clipPath);
      console.log(`${Math.round(duration)}s`);

      chapterStartSecs.set(q.question_number, Math.round(episodePosSec));
      clipPaths.push(clipPath);
      episodePosSec += duration;
    }

    // Concatenate
    const episodePath = path.join(workDir, "episode.mp3");
    await concatenateAudio(clipPaths, episodePath, workDir);
    const durationSec = Math.round(await ffprobeDuration(episodePath));
    console.log(`  Episode: ${Math.round(durationSec / 60)}min`);

    // Build chapters
    const siteUrl = process.env.APP_URL ?? "https://on-notice.xyz";
    const chaptersData = {
      version: "1.2.0",
      chapters: questions.map((q) => {
        const askerLabel = q.asker_name
          ? (q.asker_party ? `${q.asker_name} (${q.asker_party})` : q.asker_name)
          : null;
        const ministerLabel = q.minister_name
          ? (q.minister_party ? `${q.minister_name} (${q.minister_party})` : q.minister_name)
          : null;
        const prefix = askerLabel && ministerLabel
          ? `${askerLabel} → ${ministerLabel}: `
          : askerLabel ? `${askerLabel}: ` : "";
        return {
          startTime: chapterStartSecs.get(q.question_number)!,
          title: q.subject
            ? `Q${q.question_number}: ${prefix}${q.subject}`
            : `Question ${q.question_number}`,
          url: `${siteUrl}/${date}?parliament=${parliamentId}#q${q.question_number}`,
        };
      }),
    };

    // Embed ID3 CHAP frames for Apple Podcasts
    const escMeta = (s: string) => s
      .replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/;/g, "\\;").replace(/\n/g, "\\n");
    const metaLines = [";FFMETADATA1"];
    for (let i = 0; i < chaptersData.chapters.length; i++) {
      const ch = chaptersData.chapters[i];
      const startMs = Math.round(ch.startTime * 1000);
      const endMs = i + 1 < chaptersData.chapters.length
        ? Math.round(chaptersData.chapters[i + 1].startTime * 1000)
        : durationSec * 1000;
      metaLines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${startMs}`, `END=${endMs}`, `title=${escMeta(ch.title)}`, "");
    }
    const metadataPath = path.join(workDir, "ffmetadata.txt");
    fs.writeFileSync(metadataPath, metaLines.join("\n"));
    const episodeWithChaptersPath = path.join(workDir, "episode_chapters.mp3");
    await execFileAsync("ffmpeg", ["-i", episodePath, "-i", metadataPath, "-map_metadata", "1", "-codec", "copy", "-y", episodeWithChaptersPath]);
    fs.renameSync(episodeWithChaptersPath, episodePath);
    console.log(`  ID3 chapters embedded: ${chaptersData.chapters.length}`);

    // Upload episode + chapters JSON
    const audioUrl = await uploadEpisode(episodePath, parliamentId, date);
    console.log(`  Episode uploaded: ${audioUrl}`);

    const chaptersFilePath = path.join(workDir, "chapters.json");
    fs.writeFileSync(chaptersFilePath, JSON.stringify(chaptersData));
    await uploadChapters(chaptersFilePath, parliamentId, date);
    console.log(`  Chapters JSON uploaded`);

    // Update DB
    await db.from("sitting_days")
      .update({ audio_url: audioUrl, audio_duration_sec: durationSec })
      .eq("id", sitting.id);
    console.log(`  DB updated`);

  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function run() {
  const { values } = parseArgs({
    options: {
      parliament: { type: "string", default: "fed_hor" },
      date:       { type: "string" },
      from:       { type: "string" },
    },
  });

  const parliamentId = values.parliament as string;

  console.log(`\n=== Podcast Backfill ===`);
  console.log(`Parliament: ${parliamentId}`);

  if (values.date) {
    console.log(`Date: ${values.date}\n`);
    await processDay(parliamentId, values.date as string);
  } else if (values.from) {
    console.log(`From: ${values.from}\n`);
    const { data: days, error } = await db
      .from("sitting_days")
      .select("sitting_date")
      .eq("parliament_id", parliamentId)
      .gte("sitting_date", values.from as string)
      .not("audio_url", "is", null)
      .order("sitting_date");
    if (error) throw new Error(error.message);
    console.log(`Found ${days?.length ?? 0} sitting days with audio\n`);
    for (const day of days ?? []) {
      await processDay(parliamentId, day.sitting_date);
    }
  } else {
    console.error("Provide --date YYYY-MM-DD or --from YYYY-MM-DD");
    process.exit(1);
  }

  console.log("\n=== Done ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
