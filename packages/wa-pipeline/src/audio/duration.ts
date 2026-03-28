import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Returns duration in seconds using ffprobe. Returns null on failure. */
export async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const sec = parseFloat(stdout.trim());
    return isNaN(sec) ? null : Math.round(sec);
  } catch {
    return null;
  }
}
