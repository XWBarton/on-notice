/**
 * Smoke test: verify ParlView audio URL resolution + captions for a given date.
 *
 * Does NOT download the full audio (too slow) — just resolves the stream URL
 * to confirm yt-dlp can access ParlView, then fetches the caption segments.
 *
 * Usage: npx ts-node src/test-audio-captions.ts [YYYY-MM-DD]
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findParlViewVideo, questionTimeOffsets, fetchParlViewCaptions } from "./scrapers/parlview";
import { buildQtTranscriptFromParlViewCaptions } from "./audio/captions";

const execFileAsync = promisify(execFile);

const date = process.argv[2] ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date(Date.now() - 864e5));

async function main() {
  console.log(`\n=== Audio + Captions smoke test for ${date} ===\n`);

  // 1. Find ParlView video
  console.log("1. Finding ParlView video...");
  const video = await findParlViewVideo(date, "fed_hor");
  if (!video) {
    console.error("  FAIL: No ParlView video found");
    process.exit(1);
  }
  console.log(`  OK: ${video.id} — ${video.title}`);
  console.log(`     mediaSom=${video.mediaSom}  fileSom=${video.fileSom}`);
  console.log(`     hlsUrl=${video.hlsUrl}`);
  console.log(`     segments: ${video.segments.map(s => s.segmentTitle).join(", ")}`);

  // 2. QT offsets
  console.log("\n2. Finding Question Time window...");
  const qtOffsets = questionTimeOffsets(video);
  if (!qtOffsets) {
    console.error("  FAIL: No Question Time segment in metadata");
    process.exit(1);
  }
  const fmt = (s: number) => `${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m${Math.round(s%60)}s`;
  console.log(`  OK: ${fmt(qtOffsets.startSec)} → ${fmt(qtOffsets.endSec)} (${Math.round((qtOffsets.endSec - qtOffsets.startSec)/60)} min)`);

  // 3. Resolve ParlView stream URL (yt-dlp --get-url only — fast, no download)
  console.log("\n3. Resolving ParlView stream URL via yt-dlp...");
  const pageUrl = `https://www.aph.gov.au/News_and_Events/Watch_Read_Listen/ParlView/video/${video.id}`;
  try {
    const { stdout } = await execFileAsync("yt-dlp", [
      pageUrl,
      "--format", "bestaudio",
      "--get-url",
      "--no-playlist",
    ], { timeout: 60_000 });
    const streamUrl = stdout.trim().split("\n")[0];
    console.log(`  OK: ${streamUrl.slice(0, 100)}...`);
  } catch (e) {
    console.error(`  FAIL: yt-dlp could not resolve stream URL — ${(e as Error).message?.split("\n")[0]}`);
    console.error("  Audio download will fail. Check if yt-dlp is up to date: yt-dlp -U");
  }

  // 4. ParlView captions API (full-day, wall-clock timecodes)
  console.log("\n4. Fetching ParlView captions API...");
  const qtSegment = video.segments.find(s => /question time/i.test(s.segmentTitle));
  if (!qtSegment) {
    console.error("  FAIL: No Question Time segment in video metadata");
    process.exit(1);
  }
  console.log(`  QT segment: In=${qtSegment.segmentIn}  Out=${qtSegment.segmentOut}`);

  const captions = await fetchParlViewCaptions(video.id);
  if (captions.length === 0) {
    console.error("  FAIL: No captions returned");
    process.exit(1);
  }

  const qtTranscript = buildQtTranscriptFromParlViewCaptions(captions, qtSegment.segmentIn, qtSegment.segmentOut);
  if (!qtTranscript) {
    console.error("  FAIL: No speaker-call lines found in QT window");
    process.exit(1);
  }

  const lines = qtTranscript.split("\n").filter(l => !l.startsWith("---"));
  console.log(`  OK: ${lines.length} speaker-call lines`);
  console.log("  First 15 lines:");
  qtTranscript.split("\n").slice(0, 15).forEach(l => console.log(`    ${l}`));

  console.log("\n=== Smoke test PASSED ===\n");
}

main().catch((e) => {
  console.error("\nFATAL:", e.message ?? e);
  process.exit(1);
});
