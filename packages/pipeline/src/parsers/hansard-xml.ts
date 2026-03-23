/**
 * Parses OpenAustralia debate JSON to extract bills and questions.
 *
 * Actual API structure:
 * Array of {
 *   entry: { body: "Section Title", htype: "10", gid: "...", ... },
 *   subs: [{ body: "Sub title", excerpt: "...", htype: "11", gid: "...", ... }]
 * }
 */

import type { OADebatesResponse } from "../scrapers/fed-hansard";

export interface ParsedBill {
  shortTitle: string;
  longTitle: string | null;
  introducerName: string | null;
  stage: string;
  hansardRef: string | null;
  introductionText: string | null;
}

export interface ParsedQuestion {
  questionNumber: number;
  askerName: string | null;
  askerParty: string | null;
  ministerName: string | null;
  ministerParty: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
  hansardTime: string | null;
}

interface OAEntry {
  body?: string;
  htype?: string;
  gid?: string;
  htime?: string | null;
  excerpt?: string;
  listurl?: string;
}

interface OASection {
  entry?: OAEntry;
  subs?: OAEntry[];
  // Sometimes top-level items are flat (no entry wrapper)
  body?: string;
  htype?: string;
  gid?: string;
  excerpt?: string;
}

export function parseDebates(data: OADebatesResponse): {
  bills: ParsedBill[];
  questions: ParsedQuestion[];
} {
  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];

  const sections = Array.isArray(data) ? data as unknown as OASection[] : [];
  console.log(`Parsing ${sections.length} top-level sections`);

  for (const section of sections) {
    const entry = section.entry ?? section;
    const title = (entry.body ?? "").toUpperCase();

    if (title) console.log(`  Section: ${title.slice(0, 80)}`);

    // Question time
    if (title.includes("QUESTIONS WITHOUT NOTICE") || title.includes("QUESTION TIME")) {
      const subs = section.subs ?? [];
      console.log(`  → Found question time with ${subs.length} subs`);
      const qs = parseQuestionSubs(subs);
      questions.push(...qs);
    }

    // Bills
    if (title.includes("BILL") && (title.includes("READING") || title.includes("INTRODUCTION"))) {
      const bill = parseBillSection(entry, section.subs ?? []);
      if (bill) bills.push(bill);
    }

    // Also check subs for question time (sometimes nested)
    for (const sub of section.subs ?? []) {
      const subTitle = (sub.body ?? "").toUpperCase();
      if (subTitle.includes("QUESTIONS WITHOUT NOTICE") || subTitle.includes("QUESTION TIME")) {
        console.log(`  → Found question time in sub: ${subTitle.slice(0, 60)}`);
      }
    }
  }

  return { bills, questions };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseQuestionSubs(subs: OAEntry[]): ParsedQuestion[] {
  return subs
    .filter((s) => s.body || s.excerpt)
    .map((s, i) => ({
      questionNumber: i + 1,
      askerName: null,      // Requires follow-up API call for full speech
      askerParty: null,
      ministerName: null,
      ministerParty: null,
      subject: s.body ?? null,
      questionText: s.excerpt ?? "",
      answerText: "",
      hansardTime: s.htime ?? null,
    }));
}

function parseBillSection(entry: OAEntry, subs: OAEntry[]): ParsedBill | null {
  const title = entry.body ?? "";
  if (!title) return null;

  const firstSub = subs[0];
  return {
    shortTitle: cleanBillTitle(title),
    longTitle: null,
    introducerName: null,
    stage: inferStage(title),
    hansardRef: entry.gid ?? null,
    introductionText: firstSub?.excerpt?.slice(0, 2000) ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanBillTitle(title: string): string {
  return title
    .replace(/\s*[-—]\s*(FIRST|SECOND|THIRD) READING$/i, "")
    .replace(/\s*[-—]\s*INTRODUCTION$/i, "")
    .trim();
}

function inferStage(title: string): string {
  if (/first reading/i.test(title)) return "first_reading";
  if (/second reading/i.test(title)) return "second_reading";
  if (/third reading/i.test(title)) return "third_reading";
  if (/introduction/i.test(title)) return "introduction";
  return "unknown";
}
