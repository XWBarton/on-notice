/**
 * Parses APH Hansard XML to extract bills and questions.
 * Federal Hansard uses a consistent XML schema.
 */

import { XMLParser } from "fast-xml-parser";

export interface ParsedBill {
  shortTitle: string;
  longTitle: string | null;
  introducerName: string | null;
  stage: string;
  hansardRef: string | null;
  introductionText: string | null;  // first ~2000 chars of speech for AI summary
}

export interface ParsedQuestion {
  questionNumber: number;
  askerName: string | null;
  ministerName: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
  hansardTime: string | null;   // wall-clock time string e.g. "2:15 pm"
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) =>
    ["debate", "debatesection", "speech", "talker", "para"].includes(name),
});

export function parseHansardXml(xml: string): {
  bills: ParsedBill[];
  questions: ParsedQuestion[];
} {
  const doc = parser.parse(xml);
  const hansard = doc.hansard ?? doc;

  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];

  // Walk debate sections looking for bills and question time
  const debates = flatten(hansard, "debate");
  const sections = flatten(hansard, "debatesection");
  const allSections = [...debates, ...sections];

  for (const section of allSections) {
    const title = getString(section, "title")?.toUpperCase() ?? "";

    if (title.includes("BILL") && (title.includes("READING") || title.includes("INTRODUCTION"))) {
      const bill = parseBillSection(section);
      if (bill) bills.push(bill);
    }

    if (title.includes("QUESTIONS WITHOUT NOTICE") || title.includes("QUESTION TIME")) {
      const qs = parseQuestionSection(section);
      questions.push(...qs);
    }
  }

  return { bills, questions };
}

function parseBillSection(section: Record<string, unknown>): ParsedBill | null {
  const title = getString(section, "title") ?? "";
  const speeches = getSpeechTexts(section);
  const firstSpeech = speeches[0];

  if (!firstSpeech) return null;

  return {
    shortTitle: cleanBillTitle(title),
    longTitle: null,
    introducerName: firstSpeech.speaker,
    stage: inferStage(title),
    hansardRef: null,
    introductionText: firstSpeech.text.slice(0, 2000),
  };
}

function parseQuestionSection(section: Record<string, unknown>): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  const subsections = flatten(section, "debatesection");

  for (let i = 0; i < subsections.length; i++) {
    const sub = subsections[i];
    const speeches = getSpeechTexts(sub);

    if (speeches.length < 2) continue;

    const askerSpeech = speeches[0];
    const ministerSpeech = speeches[1];
    const subject = getString(sub, "title") ?? null;

    questions.push({
      questionNumber: i + 1,
      askerName: askerSpeech.speaker,
      ministerName: ministerSpeech.speaker,
      subject,
      questionText: askerSpeech.text,
      answerText: speeches.slice(1).map((s) => s.text).join("\n\n"),
      hansardTime: askerSpeech.time,
    });
  }

  return questions;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SpeechText {
  speaker: string | null;
  text: string;
  time: string | null;
}

function getSpeechTexts(section: Record<string, unknown>): SpeechText[] {
  const speeches = flatten(section, "speech");
  return speeches.map((s) => {
    const talker = (s as Record<string, unknown>).talker as Record<string, unknown> | undefined;
    const speaker = talker
      ? getString(talker, "name.@_role") ?? getString(talker, "name")
      : null;
    const time = talker ? getString(talker, "time") : null;

    const paras = flatten(s as Record<string, unknown>, "para");
    const text = paras.map((p) => extractText(p as Record<string, unknown>)).join(" ").trim();

    return { speaker: cleanName(speaker), text, time };
  });
}

function flatten(obj: unknown, key: string): Record<string, unknown>[] {
  if (!obj || typeof obj !== "object") return [];
  const val = (obj as Record<string, unknown>)[key];
  if (!val) return [];
  return Array.isArray(val) ? val as Record<string, unknown>[] : [val as Record<string, unknown>];
}

function getString(obj: unknown, path: string): string | null {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (typeof cur === "string") return cur;
  if (typeof cur === "object" && cur !== null) {
    return (cur as Record<string, unknown>)["#text"] as string ?? null;
  }
  return null;
}

function extractText(para: Record<string, unknown>): string {
  const text = para["#text"];
  if (typeof text === "string") return text;
  return JSON.stringify(para).replace(/<[^>]+>/g, "").slice(0, 500);
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

function cleanName(name: string | null): string | null {
  if (!name) return null;
  return name
    .replace(/^(Mr|Mrs|Ms|Dr|Hon|The Hon|Senator|Minister)\s+/i, "")
    .trim() || null;
}
