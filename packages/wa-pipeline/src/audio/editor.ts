/**
 * Audio editor — uses ffmpeg to cut per-question segments from the raw QWN
 * audio and concatenate the non-dixer segments into the podcast episode.
 * Ported from the federal pipeline's editor (without TTS intro clips).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

export interface QuestionSegment {
  questionNumber: number;
  /** Seconds from start of the raw audio file */
  startSec: number;
  endSec: number;
  /** If false, cut the clip but do NOT include in the podcast episode. Default: true */
  includeInPodcast?: boolean;
}

const PRE_BUFFER_SEC = 4; // lead-in covering the presiding officer's call
const POST_BUFFER_SEC = 1;
const FADE_SEC = 8;

/**
 * Cut a raw source range to an MP3, optionally fading the tail out. The fade
 * signals an edit point (a clip that ends, or that runs into removed content);
 * for questions that run straight into the next one we skip it (see buildEpisode).
 */
async function cutRange(
  sourcePath: string,
  sourceStartSec: number,
  sourceEndSec: number,
  outputPath: string,
  fadeOut: boolean
): Promise<string> {
  const start = Math.max(0, sourceStartSec);
  const duration = sourceEndSec - start;
  if (duration <= 0) throw new Error(`Invalid range: ${sourceStartSec}→${sourceEndSec}`);

  const args = ["-ss", String(start), "-i", sourcePath, "-t", String(duration)];
  if (fadeOut) {
    const fadeStart = Math.max(0, duration - FADE_SEC);
    args.push("-af", `afade=t=out:st=${fadeStart}:d=${FADE_SEC}`);
  }
  args.push("-acodec", "libmp3lame", "-ab", "64k", "-y", outputPath);

  await execFileAsync("ffmpeg", args, { timeout: 120_000 });
  return outputPath;
}

/**
 * Cut a standalone per-question clip (the audio shown against each question on
 * the website): the question's content plus lead-in/out buffers, faded out.
 */
export async function cutSegment(
  sourcePath: string,
  startSec: number,
  endSec: number,
  outputPath: string
): Promise<string> {
  return cutRange(sourcePath, startSec - PRE_BUFFER_SEC, endSec + POST_BUFFER_SEC, outputPath, true);
}

export async function concatenateAudio(
  inputPaths: string[],
  outputPath: string,
  workDir: string
): Promise<string> {
  if (inputPaths.length === 0) throw new Error("No audio files to concatenate");

  const listFile = path.join(workDir, "concat-list.txt");
  fs.writeFileSync(
    listFile,
    inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
  );

  await execFileAsync("ffmpeg", [
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 300_000 });

  return outputPath;
}

async function durationOf(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

/**
 * Cut all segments (clips for every question), then concatenate the
 * podcast-included ones into the episode MP3.
 */
export async function buildEpisode(
  rawAudioPath: string,
  segments: QuestionSegment[],
  outputPath: string,
  workDir: string
): Promise<{
  path: string;
  durationSec: number;
  clipPaths: Map<number, string>;
  /** Question number → its start offset (seconds) within the edited episode */
  chapterStartSecs: Map<number, number>;
}> {
  const parts: string[] = [];
  const clipPaths = new Map<number, string>();
  const chapterStartSecs = new Map<number, number>();
  let cursorSec = 0; // running start offset within the concatenated episode

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.startSec < 0 || seg.endSec <= seg.startSec) {
      console.warn(`  Skipping Q${seg.questionNumber}: invalid offsets (${seg.startSec}→${seg.endSec})`);
      continue;
    }
    // Standalone per-question clip (website): faded, with lead-in/out buffers.
    const segPath = path.join(workDir, `q${seg.questionNumber}.mp3`);
    await cutSegment(rawAudioPath, seg.startSec, seg.endSec, segPath);
    clipPaths.set(seg.questionNumber, segPath);

    if (seg.includeInPodcast === false) continue;

    // WA questions and their answers are short, so consecutive non-dixer
    // questions run straight into each other. When this question is immediately
    // followed by another included one (no Dorothy Dixer cut between them),
    // butt-join the episode part to where the next clip's lead-in begins — no
    // fade, no overlap, no gap. Only fade when the next part is a real edit
    // point: a removed dixer follows, or this is the final question.
    const next = segments[i + 1];
    const contiguous = next && next.includeInPodcast !== false && next.startSec > seg.startSec;
    let partPath = segPath;
    if (contiguous) {
      partPath = path.join(workDir, `ep-q${seg.questionNumber}.mp3`);
      await cutRange(rawAudioPath, seg.startSec - PRE_BUFFER_SEC, next.startSec - PRE_BUFFER_SEC, partPath, false);
    }
    parts.push(partPath);
    chapterStartSecs.set(seg.questionNumber, Math.round(cursorSec * 1000) / 1000);
    cursorSec += await durationOf(partPath);
  }

  if (parts.length === 0) throw new Error("No valid segments to build episode");

  await concatenateAudio(parts, outputPath, workDir);
  const durationSec = Math.round(await durationOf(outputPath));

  return { path: outputPath, durationSec, clipPaths, chapterStartSecs };
}

export interface Chapter {
  startTime: number;
  title: string;
  url?: string;
}

/**
 * Embed Podcasting 2.0 chapters as ID3 CHAP frames in the episode MP3 (for
 * Apple Podcasts). Podcasting 2.0 apps read the same data from chapters.json
 * via the RSS <podcast:chapters> tag. Rewrites the file in place.
 */
export async function embedChapters(
  episodePath: string,
  chapters: Chapter[],
  durationSec: number,
  workDir: string
): Promise<void> {
  if (chapters.length === 0) return;

  const escMeta = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const metaLines = [";FFMETADATA1"];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const startMs = Math.round(ch.startTime * 1000);
    const endMs =
      i + 1 < chapters.length
        ? Math.round(chapters[i + 1].startTime * 1000)
        : Math.round(durationSec * 1000);
    metaLines.push("[CHAPTER]", "TIMEBASE=1/1000", `START=${startMs}`, `END=${endMs}`, `title=${escMeta(ch.title)}`, "");
  }

  const metadataPath = path.join(workDir, "ffmetadata.txt");
  fs.writeFileSync(metadataPath, metaLines.join("\n"));
  const withChaptersPath = path.join(workDir, "episode_chapters.mp3");
  await execFileAsync("ffmpeg", [
    "-i", episodePath,
    "-i", metadataPath,
    "-map_metadata", "1",
    "-codec", "copy",
    "-y",
    withChaptersPath,
  ], { timeout: 120_000 });
  fs.renameSync(withChaptersPath, episodePath);
}
