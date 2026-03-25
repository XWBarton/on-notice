/**
 * Downloads Question Time audio from ParlView using yt-dlp.
 * Only downloads the Question Time window to save bandwidth and time.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export async function downloadQuestionTimeAudio(
  parlviewId: string,
  startSec: number,
  endSec: number,
  outputDir: string
): Promise<string> {
  const url = `https://www.aph.gov.au/News_and_Events/Watch_Read_Listen/ParlView/video/${parlviewId}`;
  const outputPath = path.join(outputDir, `question-time-raw.mp3`);

  // Format seconds as HH:MM:SS for yt-dlp --download-sections
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Add 30s buffer on each side
  const bufferedStart = Math.max(0, startSec - 30);
  const bufferedEnd = endSec + 30;
  const section = `*${fmt(bufferedStart)}-${fmt(bufferedEnd)}`;

  // Reuse existing download if present (speeds up iterative testing)
  const existing = [outputPath, outputPath.replace(".mp3", ".m4a"), outputPath.replace(".mp3", ".webm")].find((p) => fs.existsSync(p));
  if (existing) {
    console.log(`  Reusing cached audio: ${existing}`);
    return existing;
  }

  console.log(`  Downloading Question Time audio: ${fmt(bufferedStart)} → ${fmt(bufferedEnd)}`);

  // Step 1: download raw (no postprocessing — let ffmpeg handle conversion)
  const rawOutput = outputPath.replace(".mp3", ".raw.%(ext)s");
  const dlArgs = [
    url,
    "--format", "bestaudio/Video1-2@48000-64000-Audio0",
    "--download-sections", section,
    "--output", rawOutput,
    "--no-playlist",
    "--quiet",
  ];

  await execFileAsync("yt-dlp", dlArgs, { timeout: 900_000 }); // 15 min

  const rawCandidates = ["mp4", "m4a", "webm", "ts", "aac", "opus"].map((ext) =>
    outputPath.replace(".mp3", `.raw.${ext}`)
  );
  const rawFile = rawCandidates.find((p) => fs.existsSync(p));
  if (!rawFile) throw new Error(`yt-dlp did not produce a raw file in ${outputDir}`);

  // Step 2: convert to mp3 with ffmpeg
  await execFileAsync("ffmpeg", ["-i", rawFile, "-vn", "-acodec", "libmp3lame", "-ab", "64k", "-y", outputPath], {
    timeout: 300_000,
  });
  fs.unlinkSync(rawFile);

  const found = outputPath;
  if (!fs.existsSync(found)) throw new Error(`ffmpeg did not produce ${outputPath}`);

  return found;
}

/** Create a temporary working directory for audio processing */
export function createAudioWorkDir(date: string, parliamentId: string): string {
  const dir = path.join(os.tmpdir(), `on-notice-audio-${date}-${parliamentId}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
