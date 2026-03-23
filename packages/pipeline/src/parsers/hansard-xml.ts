/**
 * Parses OpenAustralia debate JSON to extract bills and questions.
 * The OpenAustralia API returns structured debate data with speaker info.
 */

import type { OADebatesResponse, OADebateSection } from "../scrapers/fed-hansard";

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

export function parseDebates(data: OADebatesResponse): {
  bills: ParsedBill[];
  questions: ParsedQuestion[];
} {
  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];

  const debates = toArray(data.debates?.debate);

  for (const debate of debates) {
    const title = getText(debate.title)?.toUpperCase() ?? "";

    if (title.includes("QUESTIONS WITHOUT NOTICE") || title.includes("QUESTION TIME")) {
      const qs = parseQuestionDebate(debate);
      questions.push(...qs);
    }

    if (title.includes("BILL") && (title.includes("READING") || title.includes("INTRODUCTION"))) {
      const bill = parseBillDebate(debate);
      if (bill) bills.push(bill);
    }

    // Also check subsections
    const subsections = toArray(debate.subsection);
    for (const sub of subsections) {
      const subTitle = getText(sub.title)?.toUpperCase() ?? "";

      if (subTitle.includes("QUESTIONS WITHOUT NOTICE") || subTitle.includes("QUESTION TIME")) {
        questions.push(...parseQuestionDebate(sub));
      }
      if (subTitle.includes("BILL") && (subTitle.includes("READING") || subTitle.includes("INTRODUCTION"))) {
        const bill = parseBillDebate(sub);
        if (bill) bills.push(bill);
      }
    }
  }

  return { bills, questions };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseQuestionDebate(section: OADebateSection): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const subsections = toArray(section.subsection);

  for (let i = 0; i < subsections.length; i++) {
    const sub = subsections[i];
    const speeches = toArray(sub.speech);

    if (speeches.length < 2) continue;

    const askerSpeech = speeches[0];
    const ministerSpeeches = speeches.slice(1);

    questions.push({
      questionNumber: i + 1,
      askerName: askerSpeech.speaker?.name ?? null,
      askerParty: askerSpeech.speaker?.party ?? null,
      ministerName: ministerSpeeches[0]?.speaker?.name ?? null,
      ministerParty: ministerSpeeches[0]?.speaker?.party ?? null,
      subject: getText(sub.title) ?? null,
      questionText: getText(askerSpeech.body) ?? "",
      answerText: ministerSpeeches.map((s) => getText(s.body) ?? "").join("\n\n"),
      hansardTime: null,
    });
  }

  return questions;
}

function parseBillDebate(section: OADebateSection): ParsedBill | null {
  const title = getText(section.title) ?? "";
  const speeches = toArray(section.speech);
  const firstSpeech = speeches[0];

  return {
    shortTitle: cleanBillTitle(title),
    longTitle: null,
    introducerName: firstSpeech?.speaker?.name ?? null,
    stage: inferStage(title),
    hansardRef: section.id ?? null,
    introductionText: getText(firstSpeech?.body)?.slice(0, 2000) ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getText(val: { "#text": string } | string | undefined): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  return val["#text"] ?? null;
}

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
