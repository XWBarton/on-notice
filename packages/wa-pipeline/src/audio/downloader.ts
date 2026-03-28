import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Download audio from an HLS m3u8 stream using ffmpeg.
 * Saves to outputDir/filename and returns the file path.
 *
 * Uses protocol_whitelist and allowed_extensions for HLS compatibility.
 * Hard timeout of 10 minutes — WA QWN is ~30–40 min of audio at 64kbps.
 */
export async function downloadHlsAudio(
  hlsUrl: string,
  outputDir: string,
  filename = "output.mp3"
): Promise<string> {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`  Audio already exists at ${outputPath}, skipping download`);
    return outputPath;
  }

  console.log(`  Downloading audio via ffmpeg: ${hlsUrl}`);
  await execFileAsync("ffmpeg", [
    "-allowed_extensions", "ALL",
    "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
    "-i", hlsUrl,
    "-vn",
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",
    outputPath,
  ], { timeout: 600_000 }); // 10 min hard limit

  const stat = fs.statSync(outputPath);
  console.log(`  Saved to ${outputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  return outputPath;
}
