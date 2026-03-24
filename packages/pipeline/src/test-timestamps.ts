/**
 * Quick local test for caption transcript building + AI timestamp extraction.
 * Uses hardcoded values from a known pipeline run — no Puppeteer/yt-dlp/ffmpeg needed.
 *
 * Usage: npx ts-node packages/pipeline/src/test-timestamps.ts
 */

import { buildQtTranscript } from "./audio/captions";
import { extractTimestampsWithAI } from "./ai/timestamp-questions";
import type { ParlViewVideo } from "./scrapers/parlview";

// Questions from DB (non-Dixers only, March 24)
const QUESTIONS = [
  { questionNumber: 1,  askerName: "Darren Chester",    askerParty: "NAT", electorate: "Gippsland" },
  { questionNumber: 3,  askerName: "Dan Tehan",         askerParty: "LIB", electorate: "Wannon" },
  { questionNumber: 5,  askerName: "Rebekha Sharkie",   askerParty: "CA",  electorate: "Mayo" },
  { questionNumber: 7,  askerName: null,                askerParty: null,  electorate: null },
  { questionNumber: 9,  askerName: null,                askerParty: null,  electorate: null },
  { questionNumber: 11, askerName: null,                askerParty: null,  electorate: null },
  { questionNumber: 13, askerName: null,                askerParty: null,  electorate: null },
  { questionNumber: 15, askerName: null,                askerParty: null,  electorate: null },
  { questionNumber: 17, askerName: null,                askerParty: null,  electorate: null },
];

async function main() {
  console.log("Fetching ParlView metadata...");
  const { findParlViewVideo, questionTimeOffsets } = await import("./scrapers/parlview");
  const video = await findParlViewVideo("2026-03-24", "fed_hor");
  if (!video) { console.error("No video found"); process.exit(1); }
  console.log(`Video: ${video.id}, fileSom: ${video.fileSom}, mediaSom: ${video.mediaSom}`);

  const qtOffsets = questionTimeOffsets(video);
  console.log(`QT: ${qtOffsets?.startSec}s → ${qtOffsets?.endSec}s`);

  console.log("\nBuilding condensed transcript...");
  const transcript = await buildQtTranscript(video, qtOffsets!.startSec, qtOffsets!.endSec);
  if (!transcript) { console.error("No transcript"); process.exit(1); }

  const lines = transcript.split("\n");
  console.log(`\nFirst 30 lines of ${lines.length} total:`);
  console.log(lines.slice(0, 30).join("\n"));

  // Search for each electorate and print matching lines
  const searchTerms = ["Gippsland", "Wannon", "Mayo", "call to the member", "give the call", "recall"];
  for (const term of searchTerms) {
    const matches = lines.filter(l => l.toLowerCase().includes(term.toLowerCase()));
    console.log(`\n"${term}" — ${matches.length} lines:`);
    matches.slice(0, 5).forEach(l => console.log(`  ${l}`));
  }

  console.log("\nCalling Sonnet for timestamps...");
  const timestamps = await extractTimestampsWithAI(transcript, QUESTIONS);
  console.log(`\nResults (${timestamps.length}/${QUESTIONS.length} found):`);
  for (const t of timestamps) {
    const min = Math.floor(t.secFromQtStart / 60);
    const sec = t.secFromQtStart % 60;
    console.log(`  Q${t.questionNumber}: T+${t.secFromQtStart}s (${min}m${sec}s from QT start)`);
  }
}

main().catch(console.error);
