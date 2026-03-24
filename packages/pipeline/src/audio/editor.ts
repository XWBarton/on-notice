/**
 * Audio editor — uses ffmpeg to:
 *   1. Cut individual question segments from the raw Question Time audio
 *   2. Prepend TTS intro clips
 *   3. Concatenate everything into a final episode MP3
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

export interface QuestionSegment {
  questionNumber: number;
  askerName: string | null;
  askerParty: string | null;
  ministerName: string | null;
  /** Seconds from start of raw audio file (already offset from recording start) */
  startSec: number;
  endSec: number;
  introClipPath?: string;
}

const BUFFER_SEC = 3; // seconds of padding before/after each question

/**
 * Cut a segment from the source audio file.
 * startSec/endSec are relative to the start of the source file.
 */
export async function cutSegment(
  sourcePath: string,
  startSec: number,
  endSec: number,
  outputPath: string
): Promise<string> {
  const duration = endSec - startSec;
  if (duration <= 0) throw new Error(`Invalid segment: ${startSec}→${endSec}`);

  await execFileAsync("ffmpeg", [
    "-ss", String(Math.max(0, startSec - BUFFER_SEC)),
    "-t", String(duration + BUFFER_SEC * 2),
    "-i", sourcePath,
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 120_000 });

  return outputPath;
}

/**
 * Concatenate a list of audio files into a single MP3.
 * Creates an ffmpeg concat list file and runs ffmpeg concat.
 */
export async function concatenateAudio(
  inputPaths: string[],
  outputPath: string,
  workDir: string
): Promise<string> {
  if (inputPaths.length === 0) throw new Error("No audio files to concatenate");

  const listFile = path.join(workDir, "concat-list.txt");
  const listContent = inputPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listFile, listContent);

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

/**
 * Build a full episode from question segments.
 * For each segment: [intro clip (optional)] + [question audio]
 */
export async function buildEpisode(
  rawAudioPath: string,
  /** Offset (seconds) that was applied when downloading — i.e. the download started this many seconds into the recording */
  downloadOffsetSec: number,
  segments: QuestionSegment[],
  outputPath: string,
  workDir: string
): Promise<{ path: string; durationSec: number }> {
  const parts: string[] = [];

  for (const seg of segments) {
    // Adjust for the download window offset
    const relStart = seg.startSec - downloadOffsetSec;
    const relEnd = seg.endSec - downloadOffsetSec;

    if (relStart < 0 || relEnd <= relStart) {
      console.warn(`  Skipping Q${seg.questionNumber}: invalid offsets (${relStart}→${relEnd})`);
      continue;
    }

    // Prepend TTS intro if available
    if (seg.introClipPath && fs.existsSync(seg.introClipPath)) {
      parts.push(seg.introClipPath);
    }

    const segPath = path.join(workDir, `q${seg.questionNumber}.mp3`);
    await cutSegment(rawAudioPath, relStart, relEnd, segPath);
    parts.push(segPath);
  }

  if (parts.length === 0) throw new Error("No valid segments to build episode");

  await concatenateAudio(parts, outputPath, workDir);

  // Get duration via ffprobe
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    outputPath,
  ]);
  const durationSec = Math.round(parseFloat(stdout.trim()));

  return { path: outputPath, durationSec };
}
