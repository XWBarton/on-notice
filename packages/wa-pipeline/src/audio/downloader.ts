import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Download audio from an HLS m3u8 stream using ffmpeg.
 * Saves to outputDir/output.mp3 and returns the file path.
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

  console.log(`  Downloading audio via ffmpeg...`);
  await execFileAsync("ffmpeg", [
    "-i", hlsUrl,
    "-vn",                    // no video
    "-acodec", "libmp3lame",
    "-ab", "64k",
    "-y",                     // overwrite if exists
    outputPath,
  ]);

  console.log(`  Saved to ${outputPath}`);
  return outputPath;
}
