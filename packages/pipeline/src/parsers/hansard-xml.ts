/**
 * Parses OpenAustralia debate data to extract bills and questions.
 *
 * Two parsers:
 *  - parseScrapedXml: primary path — parses OA's scrapedxml mirror directly (complete,
 *    published same-day, includes proper interjection/continuation entries per exchange)
 *  - parseDebates: fallback — parses the OA JSON API response (may lag a sitting day
 *    by 24h+ while OA's own proof→final Hansard publishing catches up)
 *
 * Scrapedxml structure — a flat, document-order list of siblings under <debates>,
 * not nested per question:
 *   <debates>
 *     <major-heading>QUESTIONS WITHOUT NOTICE</major-heading>
 *     <minor-heading>Topic</minor-heading>            ← one per question
 *     <speech speakerid=".." speakername=".." talktype="speech" time="HH:MM"><p>..</p></speech>
 *     <speech talktype="interjection" .../>
 *     <speech talktype="continuation" .../>            ← same speaker resuming after interruption
 *     <minor-heading>Next topic</minor-heading>
 *     ...
 *     <major-heading>BILLS</major-heading>
 *     <minor-heading>Bill Title[, Bill Title2]; Stage</minor-heading>
 *     <bills><bill id="..">Title</bill>...</bills>      ← marker only, title/stage come from the heading
 *     <division divnumber="1" time="HH:MM" .../>        ← top-level, independent of section
 *   </debates>
 */

import { XMLParser } from "fast-xml-parser";
import type { OADebatesResponse } from "../scrapers/fed-hansard";

export interface ParsedBill {
  shortTitle: string;
  longTitle: string | null;
  introducerName: string | null;
  stage: string;
  hansardRef: string | null;
  introductionText: string | null;
}

/** A single speech or interjection entry within a Q&A exchange. */
export interface XmlExchangeEntry {
  type: "speech" | "interjection";
  /** Raw speakername attribute from scrapedxml, e.g. "Penny Ying Yen Wong", "Sue Lines" */
  speakerName: string;
  electorate: string | null;
  text: string;
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
  gid: string | null;
  /** Structured exchange from scrapedxml — set only when parsed via parseScrapedXml. */
  exchange?: XmlExchangeEntry[];
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
  body?: string;
  htype?: string;
  gid?: string;
  htime?: string | null;
  excerpt?: string;
}

export interface ParsedDivisionTime {
  divisionNumber: number;
  htime: string; // e.g. "14:32:00"
}

// ── Scraped XML parser (primary) ────────────────────────────────────────────────

type XmlChild = Record<string, unknown>;

/** Recursively extract plain text from fast-xml-parser preserveOrder nodes. */
function xmlText(nodes: XmlChild[]): string {
  return nodes
    .flatMap((node): string[] => {
      if (typeof node["#text"] === "string") return [node["#text"]];
      for (const [key, val] of Object.entries(node)) {
        if (key === ":@") continue;
        if (Array.isArray(val)) return [xmlText(val as XmlChild[])];
      }
      return [];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text from <p> elements that are direct children of a <speech>. */
function speechText(speechChildren: XmlChild[]): string {
  return speechChildren
    .filter((n) => Array.isArray(n["p"]))
    .map((n) => xmlText(n["p"] as XmlChild[]))
    .filter(Boolean)
    .join("\n\n");
}

/** Split a bill minor-heading "Title[, Title2]; Stage" into (titles, stage). */
function splitBillHeading(heading: string): { titlesPart: string; stagePart: string | null } {
  const idx = heading.lastIndexOf(";");
  if (idx === -1) return { titlesPart: heading, stagePart: null };
  return { titlesPart: heading.slice(0, idx).trim(), stagePart: heading.slice(idx + 1).trim() };
}

interface InProgressQuestion {
  subject: string | null;
  exchange: XmlExchangeEntry[];
  askerName: string | null;
  ministerName: string | null;
  hansardTime: string | null;
}

/**
 * Parse OA's scrapedxml mirror into bills, questions, and division times.
 * Structure: flat <debates> with major-heading/minor-heading/speech/bills/division
 * siblings in document order — see file header comment for details.
 */
export function parseScrapedXml(xmlText_: string): {
  bills: ParsedBill[];
  questions: ParsedQuestion[];
  divisionTimes: ParsedDivisionTime[];
} {
  let parsed: XmlChild[];
  try {
    const parser = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      maxNestedTags: 2000,
      // Hansard text is full of &apos;/&#8217; etc. — the default 1000-expansion
      // safety limit (meant to guard against entity-bomb attacks) trips on a normal
      // sitting day's worth of contractions well before the document ends.
      processEntities: { maxTotalExpansions: 200_000 },
    });
    parsed = parser.parse(xmlText_) as XmlChild[];
  } catch (e) {
    console.warn(`  Scraped XML parse error: ${e}`);
    return { bills: [], questions: [], divisionTimes: [] };
  }

  const debatesEl = parsed.find((n) => Array.isArray(n["debates"]));
  if (!debatesEl) return { bills: [], questions: [], divisionTimes: [] };
  const nodes = debatesEl["debates"] as XmlChild[];

  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];
  const divisionTimes: ParsedDivisionTime[] = [];
  let divisionCounter = 0;

  type Section = "QWN" | "BILLS" | "OTHER";
  let section: Section = "OTHER";
  let currentQuestion: InProgressQuestion | null = null;
  let pendingBillHeading: string | null = null;

  const flushQuestion = () => {
    if (!currentQuestion || !currentQuestion.askerName) {
      currentQuestion = null;
      return;
    }
    const { subject, exchange, askerName, ministerName, hansardTime } = currentQuestion;
    const questionText = exchange
      .filter((e) => e.type === "speech" && e.speakerName === askerName)
      .map((e) => e.text)
      .join("\n\n");
    const answerText = exchange
      .filter((e) => e.type === "speech" && ministerName && e.speakerName === ministerName)
      .map((e) => e.text)
      .join("\n\n");
    questions.push({
      questionNumber: questions.length + 1,
      askerName,
      askerParty: null,
      ministerName,
      ministerParty: null,
      subject,
      questionText,
      answerText,
      hansardTime,
      gid: null, // scrapedxml has no OA-style GIDs
      exchange,
    });
    currentQuestion = null;
  };

  for (const node of nodes) {
    const attrs = (node[":@"] ?? {}) as Record<string, string>;

    // ── Section headers ────────────────────────────────────────────────────────
    if (Array.isArray(node["major-heading"])) {
      if (section === "QWN") flushQuestion();
      const heading = xmlText(node["major-heading"] as XmlChild[]).toUpperCase();
      if (heading.includes("QUESTIONS WITHOUT NOTICE") && !heading.includes("TAKE NOTE")) {
        section = "QWN";
        console.log(`  → XML: Found question time`);
      } else if (heading === "BILLS") {
        section = "BILLS";
      } else {
        section = "OTHER";
      }
      pendingBillHeading = null;
      continue;
    }

    if (Array.isArray(node["minor-heading"])) {
      const heading = xmlText(node["minor-heading"] as XmlChild[]);
      if (section === "QWN") {
        flushQuestion();
        currentQuestion = { subject: heading || null, exchange: [], askerName: null, ministerName: null, hansardTime: null };
      } else if (section === "BILLS") {
        pendingBillHeading = heading || null;
      }
      continue;
    }

    // ── Bills — title(s) + stage come from the preceding minor-heading ─────────
    if (Array.isArray(node["bills"])) {
      if (section === "BILLS" && pendingBillHeading) {
        const { titlesPart, stagePart } = splitBillHeading(pendingBillHeading);
        const stage = inferStage(stagePart ?? pendingBillHeading);
        for (const title of titlesPart.split(",").map((t) => t.trim()).filter(Boolean)) {
          bills.push({
            shortTitle: title,
            longTitle: null,
            introducerName: null,
            stage,
            hansardRef: null,
            introductionText: null,
          });
        }
      }
      pendingBillHeading = null;
      continue;
    }

    // ── Divisions — top-level, independent of section ──────────────────────────
    if (Array.isArray(node["division"])) {
      const time = attrs["@_time"];
      if (time) {
        divisionCounter++;
        divisionTimes.push({ divisionNumber: divisionCounter, htime: `${time}:00` });
      }
      continue;
    }

    // ── Question time speeches ───────────────────────────────────────────────
    if (Array.isArray(node["speech"]) && section === "QWN" && currentQuestion) {
      const speechChildren = node["speech"] as XmlChild[];
      const speaker = attrs["@_speakername"];
      const talktype = attrs["@_talktype"];
      const time = attrs["@_time"];
      if (!speaker) continue;

      const text = speechText(speechChildren);
      if (!text) continue;

      if (talktype === "interjection") {
        currentQuestion.exchange.push({ type: "interjection", speakerName: speaker, electorate: null, text });
        continue;
      }

      if (talktype === "continuation") {
        const last = currentQuestion.exchange[currentQuestion.exchange.length - 1];
        if (last && last.type === "speech" && last.speakerName === speaker) {
          last.text += "\n\n" + text;
        } else {
          currentQuestion.exchange.push({ type: "speech", speakerName: speaker, electorate: null, text });
        }
        continue;
      }

      // Normal speech — set asker/minister from the first two distinct speakers
      currentQuestion.exchange.push({ type: "speech", speakerName: speaker, electorate: null, text });
      if (currentQuestion.askerName === null) {
        currentQuestion.askerName = speaker;
        currentQuestion.hansardTime = time ? `${time}:00` : null;
      } else if (currentQuestion.ministerName === null && speaker !== currentQuestion.askerName) {
        currentQuestion.ministerName = speaker;
      }
    }
  }
  if (section === "QWN") flushQuestion();

  console.log(`  XML: ${questions.length} questions, ${bills.length} bills, ${divisionTimes.length} divisions`);
  return { bills, questions, divisionTimes };
}

// ── JSON API parser (fallback) ────────────────────────────────────────────────

export function parseDebates(data: OADebatesResponse): {
  bills: ParsedBill[];
  questions: ParsedQuestion[];
  divisionTimes: ParsedDivisionTime[];
} {
  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];
  const divisionTimes: ParsedDivisionTime[] = [];
  let divisionCounter = 0;

  const sections = Array.isArray(data) ? data as unknown as OASection[] : [];
  console.log(`Parsing ${sections.length} top-level sections`);

  for (const section of sections) {
    const entry = section.entry ?? section;
    const title = (entry.body ?? "").toUpperCase();

    if (title) console.log(`  Section: ${title.slice(0, 80)}`);

    // Question time — skip tiny sections (< 5 subs), they're procedural headers not real QT
    if (title.includes("QUESTIONS WITHOUT NOTICE") || title.includes("QUESTION TIME")) {
      const subs = section.subs ?? [];
      console.log(`  → Found question time with ${subs.length} subs`);
      if (subs.length < 5) { console.log(`    Skipping (too few subs — likely procedural header)`); continue; }
      const qs = parseQuestionSubs(subs);
      const offset = questions.length;
      for (const q of qs) questions.push({ ...q, questionNumber: offset + q.questionNumber });
    }

    // Bills — two forms:
    // 1. Top-level section is the bill reading itself (e.g. "Some Bill — First Reading")
    // 2. Top-level section is a "BILLS" container; individual readings are in subs
    if (title.includes("BILL") && (title.includes("READING") || title.includes("INTRODUCTION"))) {
      const bill = parseBillSection(entry, section.subs ?? []);
      if (bill) bills.push(bill);
    } else if (/^BILLS?\s*$/.test(title.trim())) {
      for (const sub of section.subs ?? []) {
        const subTitle = (sub.body ?? "").toUpperCase();
        if (subTitle.includes("BILL") && (subTitle.includes("READING") || subTitle.includes("INTRODUCTION"))) {
          const bill = parseBillSection(sub, []);
          if (bill) bills.push(bill);
        }
      }
    }

    // Questions — also check subs when top-level section doesn't match QT titles
    if (!title.includes("QUESTIONS WITHOUT NOTICE") && !title.includes("QUESTION TIME")) {
      for (const sub of section.subs ?? []) {
        const subTitle = (sub.body ?? "").toUpperCase();
        if (subTitle.includes("QUESTIONS WITHOUT NOTICE") || subTitle.includes("QUESTION TIME")) {
          console.log(`  → Found question time in sub: ${subTitle.slice(0, 80)}`);
        }
      }
    }

    // Division timestamps — OA logs each division as a section with htime
    if (title.includes("DIVISION")) {
      const htime = entry.htime ?? null;
      if (htime) {
        divisionCounter++;
        divisionTimes.push({ divisionNumber: divisionCounter, htime });
      }
    }

    for (const sub of section.subs ?? []) {
      const subTitle = (sub.body ?? "").toUpperCase();
      if (subTitle.includes("DIVISION") && sub.htime) {
        divisionCounter++;
        divisionTimes.push({ divisionNumber: divisionCounter, htime: sub.htime });
      }
    }
  }

  return { bills, questions, divisionTimes };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseQuestionSubs(subs: OAEntry[]): ParsedQuestion[] {
  if (subs.length > 0) {
    console.log(`  First question sub keys: ${Object.keys(subs[0]).join(", ")}`);
    console.log(`  First question sub raw: ${JSON.stringify(subs[0]).slice(0, 300)}`);
  }
  return subs
    .filter((s) => s.body || s.excerpt)
    .map((s, i) => ({
      questionNumber: i + 1,
      askerName: null,
      askerParty: null,
      ministerName: null,
      ministerParty: null,
      subject: s.body ?? null,
      questionText: s.excerpt ?? "",
      answerText: "",
      hansardTime: s.htime ?? null,
      gid: s.gid ?? null,
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
