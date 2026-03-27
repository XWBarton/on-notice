/**
 * Debug ParlView closed captions for a specific date.
 * Shows what's in the filtered transcript around key timestamps.
 * Usage: cd packages/pipeline && env $(cat .env | grep -v '^#' | xargs) npx ts-node src/test-parlview-captions.ts
 */

import { buildQtTranscriptFromParlViewCaptions } from "./audio/captions";

const DATE = process.env.DATE ?? "2026-03-26";
const PARLIAMENT = process.env.PARLIAMENT ?? "fed_hor";

async function main() {
  const { findParlViewVideo, questionTimeOffsets, fetchParlViewCaptions } = await import("./scrapers/parlview");

  const video = await findParlViewVideo(DATE, PARLIAMENT as "fed_hor" | "fed_sen");
  if (!video) { console.error("No video"); process.exit(1); }

  const qtOffsets = questionTimeOffsets(video);
  if (!qtOffsets) { console.error("No QT offsets"); process.exit(1); }
  console.log(`QT: ${qtOffsets.startSec}s → ${qtOffsets.endSec}s`);

  const captions = await fetchParlViewCaptions(video.id);
  console.log(`Fetched ${captions.length} ParlView captions\n`);

  // Find the QT segment
  const qtSeg = video.segments.find(s => /question time/i.test(s.segmentTitle));
  if (!qtSeg) { console.error("No QT segment"); process.exit(1); }

  // Build the filtered transcript
  const { timecodeToSeconds } = await import("./scrapers/parlview");
  const qtStartSec = qtOffsets.startSec;

  // Show ALL raw captions in a time range (T+2400–2700s)
  const showRange = [2400, 2700];
  console.log(`\n--- Raw ParlView captions T+${showRange[0]}–${showRange[1]}s ---`);
  for (const c of captions) {
    const sec = timecodeToSeconds(c.In) - qtStartSec;
    if (sec >= showRange[0] && sec <= showRange[1]) {
      console.log(`T+${Math.round(sec)}s: ${c.Text}`);
    }
  }

  // Build and show filtered transcript around same range
  const transcript = buildQtTranscriptFromParlViewCaptions(
    captions,
    qtSeg.segmentIn,
    qtSeg.segmentOut
  );
  if (!transcript) { console.log("\nNo transcript generated"); return; }

  const lines = transcript.split("\n");
  console.log(`\n--- Filtered transcript (${lines.length} lines total) ---`);
  console.log(`Lines in T+${showRange[0]}–${showRange[1]}s range:`);
  lines.filter(l => {
    const m = l.match(/^T\+(\d+)s:/);
    if (!m) return false;
    const t = parseInt(m[1]);
    return t >= showRange[0] && t <= showRange[1];
  }).forEach(l => console.log(l));

  // Search for key terms
  const searches = ["Calare", "Barker", "Gee", "Pasin", "call", "honourable", "My question", "I thank"];
  console.log("\n--- Keyword search in filtered transcript ---");
  for (const term of searches) {
    const matches = lines.filter(l => l.toLowerCase().includes(term.toLowerCase()) && !l.startsWith("---"));
    if (matches.length) {
      console.log(`\n"${term}" (${matches.length}):`);
      matches.slice(0, 6).forEach(l => console.log(`  ${l}`));
    }
  }
}

main().catch(console.error);
