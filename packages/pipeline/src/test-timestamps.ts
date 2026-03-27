/**
 * Quick local test for caption transcript building + AI timestamp extraction.
 * Uses hardcoded values from a known pipeline run — no Puppeteer/yt-dlp/ffmpeg needed.
 *
 * Usage: cd packages/pipeline && npx ts-node src/test-timestamps.ts
 *        DATE=2026-03-26 PARLIAMENT=fed_hor npx ts-node src/test-timestamps.ts
 */

import { buildQtTranscript } from "./audio/captions";
import { extractTimestampsWithAI } from "./ai/timestamp-questions";

const DATE = process.env.DATE ?? "2026-03-26";
const PARLIAMENT = process.env.PARLIAMENT ?? "fed_hor";
const CHAMBER = PARLIAMENT === "fed_sen" ? "senate" : "house";

// Questions from March 26 HoR — includes Dixers (marked) and Gee/Pasin
// Update these to match what's in the DB for the date you're testing
const QUESTIONS_HOR: Parameters<typeof extractTimestampsWithAI>[1] = [
  { questionNumber: 1,  askerName: "Angus Taylor",      askerParty: "LIB", electorate: "Hume",       isDorothyDixer: false },
  { questionNumber: 2,  askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 3,  askerName: "Alison Penfold",    askerParty: "NAT", electorate: "New England", isDorothyDixer: false },
  { questionNumber: 4,  askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 5,  askerName: "Andrew Gee",        askerParty: "IND", electorate: "Calare",     isDorothyDixer: false },
  { questionNumber: 6,  askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 7,  askerName: "Tony Pasin",        askerParty: "LIB", electorate: "Barker",     isDorothyDixer: false },
  { questionNumber: 8,  askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 9,  askerName: null,                askerParty: null,  electorate: null,         isDorothyDixer: false },
  { questionNumber: 10, askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 11, askerName: null,                askerParty: null,  electorate: null,         isDorothyDixer: false },
  { questionNumber: 12, askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 13, askerName: null,                askerParty: null,  electorate: null,         isDorothyDixer: false },
  { questionNumber: 14, askerName: null,                askerParty: "ALP", electorate: null,         isDorothyDixer: true  },
  { questionNumber: 15, askerName: null,                askerParty: null,  electorate: null,         isDorothyDixer: false },
];

const QUESTIONS_SEN: Parameters<typeof extractTimestampsWithAI>[1] = [
  { questionNumber: 1,  askerName: "Richard Colbeck",  askerParty: "LIB", electorate: "Tasmania",  isDorothyDixer: false },
  { questionNumber: 2,  askerName: null,               askerParty: "ALP", electorate: null,        isDorothyDixer: true  },
  { questionNumber: 3,  askerName: null,               askerParty: null,  electorate: null,        isDorothyDixer: false },
  { questionNumber: 4,  askerName: null,               askerParty: "ALP", electorate: null,        isDorothyDixer: true  },
  { questionNumber: 5,  askerName: null,               askerParty: null,  electorate: null,        isDorothyDixer: false },
];

async function main() {
  console.log(`Testing ${PARLIAMENT} for ${DATE}\n`);

  const { findParlViewVideo, questionTimeOffsets } = await import("./scrapers/parlview");
  const video = await findParlViewVideo(DATE, PARLIAMENT as "fed_hor" | "fed_sen");
  if (!video) { console.error("No video found"); process.exit(1); }
  console.log(`Video: ${video.id}, fileSom: ${video.fileSom}, mediaSom: ${video.mediaSom}`);

  const qtOffsets = questionTimeOffsets(video);
  if (!qtOffsets) { console.error("No QT offsets"); process.exit(1); }
  console.log(`QT window: ${qtOffsets.startSec}s → ${qtOffsets.endSec}s`);

  console.log("\nBuilding condensed transcript...");
  const transcript = await buildQtTranscript(video, qtOffsets.startSec, qtOffsets.endSec);
  if (!transcript) { console.error("No transcript"); process.exit(1); }

  const lines = transcript.split("\n");
  console.log(`\nTranscript (${lines.length} lines total). First 40 lines:`);
  console.log(lines.slice(0, 40).join("\n"));

  // Search for key electorates
  const searchTerms = PARLIAMENT === "fed_hor"
    ? ["Calare", "Barker", "Hume", "New England", "Gee", "Pasin", "give the call", "I call", "member for"]
    : ["Colbeck", "senator", "give the call", "I call"];

  console.log("\n--- Keyword search ---");
  for (const term of searchTerms) {
    const matches = lines.filter(l => l.toLowerCase().includes(term.toLowerCase()));
    if (matches.length) {
      console.log(`\n"${term}" (${matches.length} lines):`);
      matches.slice(0, 8).forEach(l => console.log(`  ${l}`));
    }
  }

  const questions = PARLIAMENT === "fed_sen" ? QUESTIONS_SEN : QUESTIONS_HOR;

  console.log("\n--- Calling AI for timestamps ---");
  const timestamps = await extractTimestampsWithAI(transcript, questions, CHAMBER as "house" | "senate");
  console.log(`\nResults (${timestamps.length}/${questions.length} questions):`);
  for (const t of timestamps.sort((a, b) => a.questionNumber - b.questionNumber)) {
    const min = Math.floor(t.secFromQtStart / 60);
    const sec = t.secFromQtStart % 60;
    const q = questions.find(q => q.questionNumber === t.questionNumber);
    const label = q?.isDorothyDixer ? " [Dixer]" : "";
    const name = q?.askerName ?? "?";
    console.log(`  Q${t.questionNumber}${label}: T+${t.secFromQtStart}s (${min}m${sec}s) — ${name}`);
  }

  const missing = questions.filter(q => !timestamps.find(t => t.questionNumber === q.questionNumber));
  if (missing.length) {
    console.log(`\nMissing (${missing.length}): ${missing.map(q => `Q${q.questionNumber}`).join(", ")}`);
  }
}

main().catch(console.error);
