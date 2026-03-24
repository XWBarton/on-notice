/**
 * Uses ffmpeg silencedetect to find natural break points in Question Time audio.
 * Parliament has consistent pauses when the Speaker calls the next question.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SilenceGap {
  start: number;
  end: number;
  duration: number;
  mid: number;
}

/**
 * Detect silence gaps in an audio file.
 * Returns gaps sorted by duration (longest first).
 */
export async function detectSilence(
  audioPath: string,
  noiseTolerance = "-35dB",
  minDuration = 0.3
): Promise<SilenceGap[]> {
  // ffmpeg writes silencedetect output to stderr
  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", audioPath,
    "-af", `silencedetect=noise=${noiseTolerance}:d=${minDuration}`,
    "-f", "null",
    "-",
  ], { timeout: 120_000 }).catch((e) => ({ stderr: e.stderr as string ?? "" }));

  const gaps: SilenceGap[] = [];
  const startMatches = [...stderr.matchAll(/silence_start: ([\d.]+)/g)];
  const endMatches = [...stderr.matchAll(/silence_end: ([\d.]+)/g)];

  for (let i = 0; i < Math.min(startMatches.length, endMatches.length); i++) {
    const start = parseFloat(startMatches[i][1]);
    const end = parseFloat(endMatches[i][1]);
    gaps.push({ start, end, duration: end - start, mid: (start + end) / 2 });
  }

  return gaps.sort((a, b) => b.duration - a.duration);
}

/**
 * Given a list of silence gaps and a question count, pick the best N-1 cut points.
 * Returns cut timestamps sorted ascending — these are the START times of each question
 * (i.e. the audio position where we should begin the next question's clip).
 */
export function pickCutPoints(
  gaps: SilenceGap[],
  questionCount: number,
  audioStartSec: number,
  audioEndSec: number
): number[] {
  if (questionCount <= 1) return [audioStartSec];

  const neededCuts = questionCount - 1;

  // Filter to gaps inside the QT window
  const inWindow = gaps.filter(
    (g) => g.start >= audioStartSec && g.end <= audioEndSec
  );

  // Take the top N gaps by duration, then sort them by position
  const topGaps = inWindow
    .slice(0, neededCuts * 3) // consider 3x more candidates than needed
    .sort((a, b) => a.mid - b.mid);

  // Greedily pick gaps that are at least 60s apart (avoid consecutive minor pauses)
  const chosen: SilenceGap[] = [];
  for (const gap of topGaps.sort((a, b) => b.duration - a.duration)) {
    const tooClose = chosen.some((c) => Math.abs(c.mid - gap.mid) < 60);
    if (!tooClose) {
      chosen.push(gap);
      if (chosen.length === neededCuts) break;
    }
  }

  // Sort chosen cuts by position and return midpoints
  return chosen.sort((a, b) => a.mid - b.mid).map((g) => g.mid);
}
