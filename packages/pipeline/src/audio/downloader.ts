/**
 * Downloads Question Time audio from ParlView using yt-dlp + ffmpeg.
 * yt-dlp resolves the stream URL; ffmpeg handles the HLS download and encoding.
 * This avoids fragmented MP4 container issues that arise when yt-dlp downloads
 * HLS sections directly (the resulting fMP4 files lack a proper moov atom).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

export async function downloadQuestionTimeAudio(
  hlsUrl: string,
  startSec: number,
  endSec: number,
  outputDir: string
): Promise<string> {
  const outputPath = path.join(outputDir, `question-time-raw.mp3`);

  // Add 30s buffer on each side
  const bufferedStart = Math.max(0, startSec - 30);
  const bufferedEnd = endSec + 30;
  const duration = bufferedEnd - bufferedStart;

  // Format seconds as HH:MM:SS for logging
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // Reuse existing download if present (speeds up iterative testing)
  if (fs.existsSync(outputPath)) {
    console.log(`  Reusing cached audio: ${outputPath}`);
    return outputPath;
  }

  // hlsUrl is the direct HLS m3u8 for the correct chunk — no yt-dlp needed
  const streamUrl = hlsUrl;
  console.log(`  Downloading Question Time audio via ffmpeg: ${fmt(bufferedStart)} → ${fmt(bufferedEnd)}`);

  // ffmpeg handles HLS natively: pre-input -ss seeks within the m3u8 playlist (0-based),
  // and re-encoding to MP3 produces a clean file with timestamps starting at 0.
  await execFileAsync("ffmpeg", [
    "-allowed_extensions", "ALL",
    "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
    "-ss", String(bufferedStart),
    "-i", streamUrl,
    "-t", String(duration),
    "-vn",
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 900_000 }); // 15 min

  return outputPath;
}

/**
 * Download Question Time audio from the Australian Parliament Live YouTube channel.
 * Uses yt-dlp to resolve the stream URL and ffmpeg to cut and encode the QT section.
 *
 * @param videoId       YouTube video ID
 * @param qtStartInYt   Seconds from YouTube video start where QT begins
 * @param qtEndInYt     Seconds from YouTube video start where QT ends
 * @param outputDir     Working directory for output file
 */
export async function downloadYouTubeQuestionTimeAudio(
  videoId: string,
  qtStartInYt: number,
  qtEndInYt: number,
  outputDir: string
): Promise<string> {
  const outputPath = path.join(outputDir, "question-time-raw.mp3");

  if (fs.existsSync(outputPath)) {
    console.log(`  Reusing cached audio: ${outputPath}`);
    return outputPath;
  }

  const bufferedStart = Math.max(0, qtStartInYt - 30);
  const bufferedEnd = qtEndInYt + 30;
  const duration = bufferedEnd - bufferedStart;

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`  Getting YouTube stream URL for ${videoId}...`);

  const { stdout: urlOutput } = await execFileAsync("yt-dlp", [
    url,
    "--format", "bestaudio",
    "--get-url",
    "--no-playlist",
  ], { timeout: 60_000 });

  const streamUrl = urlOutput.trim().split("\n")[0];
  console.log(`  Downloading YouTube QT audio via ffmpeg: ${fmt(bufferedStart)} → ${fmt(bufferedEnd)}`);

  await execFileAsync("ffmpeg", [
    "-allowed_extensions", "ALL",
    "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
    "-ss", String(bufferedStart),
    "-i", streamUrl,
    "-t", String(duration),
    "-vn",
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 900_000 });

  return outputPath;
}

/**
 * Download a podcast episode MP3 directly from a CDN URL (no yt-dlp required).
 * Uses curl for reliable large-file downloading with redirect support.
 */
export async function downloadPodcastAudio(
  audioUrl: string,
  outputDir: string
): Promise<string> {
  const outputPath = path.join(outputDir, "question-time-raw.mp3");

  if (fs.existsSync(outputPath)) {
    console.log(`  Reusing cached audio: ${outputPath}`);
    return outputPath;
  }

  console.log(`  Downloading podcast MP3...`);
  await execFileAsync("curl", ["-L", "-o", outputPath, audioUrl], { timeout: 300_000 });
  return outputPath;
}

/** Create a temporary working directory for audio processing */
export function createAudioWorkDir(date: string, parliamentId: string): string {
  const dir = path.join(os.tmpdir(), `on-notice-audio-${date}-${parliamentId}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.chmodSync(dir, 0o755); // ensure writable if restored from cache with wrong permissions
  return dir;
}
