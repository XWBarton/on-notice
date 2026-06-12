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

export async function cutSegment(
  sourcePath: string,
  startSec: number,
  endSec: number,
  outputPath: string
): Promise<string> {
  const duration = endSec - startSec;
  if (duration <= 0) throw new Error(`Invalid segment: ${startSec}→${endSec}`);

  const totalDuration = duration + PRE_BUFFER_SEC + POST_BUFFER_SEC;
  const FADE_SEC = 8;
  const fadeStart = Math.max(0, totalDuration - FADE_SEC);

  await execFileAsync("ffmpeg", [
    "-ss", String(Math.max(0, startSec - PRE_BUFFER_SEC)),
    "-i", sourcePath,
    "-t", String(totalDuration),
    "-af", `afade=t=out:st=${fadeStart}:d=${FADE_SEC}`,
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 120_000 });

  return outputPath;
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
): Promise<{ path: string; durationSec: number; clipPaths: Map<number, string> }> {
  const parts: string[] = [];
  const clipPaths = new Map<number, string>();

  for (const seg of segments) {
    if (seg.startSec < 0 || seg.endSec <= seg.startSec) {
      console.warn(`  Skipping Q${seg.questionNumber}: invalid offsets (${seg.startSec}→${seg.endSec})`);
      continue;
    }
    const segPath = path.join(workDir, `q${seg.questionNumber}.mp3`);
    await cutSegment(rawAudioPath, seg.startSec, seg.endSec, segPath);
    clipPaths.set(seg.questionNumber, segPath);
    if (seg.includeInPodcast !== false) parts.push(segPath);
  }

  if (parts.length === 0) throw new Error("No valid segments to build episode");

  await concatenateAudio(parts, outputPath, workDir);
  const durationSec = Math.round(await durationOf(outputPath));

  return { path: outputPath, durationSec, clipPaths };
}
