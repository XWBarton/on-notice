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
 *     <minor-heading>Topic</minor-heading>            ← usually one per question, but
 *                                                       consecutive questions on the same
 *                                                       topic share a single heading
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

const NAMED_ENTITIES: Record<string, string> = {
  apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", hellip: "…",
};

/**
 * Decode entities the XML parser leaves behind. OA's scrapedxml switched from literal
 * characters to numeric references (&#x2014; &#xA0;) in Sept 2026, which fast-xml-parser
 * passes through untouched — without this they end up verbatim in the stored text.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => safeCodePoint(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec) => safeCodePoint(parseInt(dec, 10), m))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/g, "&")
    .replace(/\u00a0/g, " ");
}

function safeCodePoint(code: number, fallback: string): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback;
}

/** Recursively extract plain text from fast-xml-parser preserveOrder nodes. */
function xmlText(nodes: XmlChild[]): string {
  return decodeEntities(
    nodes
      .flatMap((node): string[] => {
        if (typeof node["#text"] === "string") return [node["#text"]];
        for (const [key, val] of Object.entries(node)) {
          if (key === ":@") continue;
          if (Array.isArray(val)) return [xmlText(val as XmlChild[])];
        }
        return [];
      })
      .join(" ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract text from <p> elements that are direct children of a <speech>. */
function speechText(speechChildren: XmlChild[]): string {
  return speechChildren
    .filter((n) => Array.isArray(n["p"]))
    .map((n) => xmlText(n["p"] as XmlChild[]))
    .filter(Boolean)
    .join("\n\n")
    // OA leaves an empty "():" where APH prints the member's electorate/time prefix
    .replace(/^\(\s*\)\s*:?\s*/, "");
}

// ── Question-time speaker classification ────────────────────────────────────────

const QWN_HEADING_RE = /^QUESTIONS WITHOUT NOTICE(?!\s*:)/;

/**
 * True only for the question-time section itself. "QUESTIONS WITHOUT NOTICE: TAKE NOTE
 * OF ANSWERS" and "QUESTIONS WITHOUT NOTICE: ADDITIONAL ANSWERS" are ministers and
 * senators speaking after question time — treating them as questions produced phantom
 * entries where the "asker" was a minister.
 */
function isQuestionTimeHeading(heading: string): boolean {
  return QWN_HEADING_RE.test(heading.trim().toUpperCase());
}

/** "Opposition Members", "Hon. Members", "Government Senators", "An opposition member" */
function isGroupSpeaker(name: string, speakerId: string | undefined): boolean {
  if (!speakerId || speakerId === "unknown") return true;
  return /\b(members?|senators?)$/i.test(name.trim());
}

/**
 * A new primary question, as opposed to a minister's answer or a second minister adding
 * to one. Used to split consecutive questions that Hansard files under one topic heading.
 */
function looksLikeNewQuestion(text: string): boolean {
  const head = text.slice(0, 300);
  if (STRONG_QUESTION_RE.test(head.slice(0, 200))) return true;
  if (ADDRESSED_TO_RE.test(head)) return true;
  // Ministers open with "I thank the member for her question" — never a new question.
  if (/\bthanks?\b.{0,80}\bquestion\b/i.test(head)) return false;
  // Unaddressed crossbench-style question ("Last week the 45th woman was killed… will the
  // government act?"). Questions are capped at ~45 seconds, so a long speech that merely
  // ends on a rhetorical question is an answer, not a question.
  return /\?["'\u2019\u201d]?\s*$/.test(text) && text.split(/\s+/).length <= 200;
}

// "My question is to…", "My question is also for…", "I've got another question for…".
// Deliberately requires the first-person form: ministers say things like "I think this
// question is for the Minister for X", which must not read as a new question.
const STRONG_QUESTION_RE =
  /\bmy question\b[^.?!]{0,40}\b(?:to|for)\b|\bI(?:'ve| have)? (?:got )?(?:a|another) question (?:to|for)\b/i;
const ADDRESSED_TO_RE =
  /^\W*(?:(?:to|for) the (?:prime minister|deputy prime minister|treasurer|attorney-general|minister|assistant minister|leader)\b|(?:prime minister|deputy prime minister|treasurer|attorney-general|minister)\s*[,:])/i;

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
 * Identify who was in the chair during question time: the speaker with by far the most
 * interjection-type entries inside the QWN sections (every point of order, call and
 * "Order!" is theirs). scrapedxml carries no role attribute, so this is inferred per day.
 */
function findPresidingOfficers(nodes: XmlChild[]): Set<string | undefined> {
  const counts = new Map<string, number>();
  let inQwn = false;
  for (const node of nodes) {
    if (Array.isArray(node["major-heading"])) {
      inQwn = isQuestionTimeHeading(xmlText(node["major-heading"] as XmlChild[]));
      continue;
    }
    if (!inQwn || !Array.isArray(node["speech"])) continue;
    const attrs = (node[":@"] ?? {}) as Record<string, string>;
    const id = attrs["@_speakerid"];
    const name = attrs["@_speakername"] ?? "";
    if (attrs["@_talktype"] !== "interjection" || isGroupSpeaker(name, id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const presiding = new Set<string | undefined>();
  // Needs a clear lead — on a quiet day with no obvious chair, exclude no one.
  if (ranked.length > 0 && ranked[0][1] >= 3 && ranked[0][1] > (ranked[1]?.[1] ?? 0)) {
    presiding.add(ranked[0][0]);
  }
  return presiding;
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
  let currentTopic: string | null = null;
  let pendingBillHeading: string | null = null;

  const presidingIds = findPresidingOfficers(nodes);

  const newQuestion = (): InProgressQuestion => ({
    subject: currentTopic,
    exchange: [],
    askerName: null,
    ministerName: null,
    hansardTime: null,
  });

  const flushQuestion = () => {
    if (!currentQuestion || !currentQuestion.askerName) {
      currentQuestion = null;
      return;
    }
    const { subject, exchange, askerName, hansardTime } = currentQuestion;
    // The answering minister is whoever (other than the asker) said the most — not simply
    // the first to stand, which is often someone taking a point of order before the answer.
    const spoken = new Map<string, number>();
    for (const e of exchange) {
      if (e.type !== "speech" || e.speakerName === askerName) continue;
      spoken.set(e.speakerName, (spoken.get(e.speakerName) ?? 0) + e.text.length);
    }
    const mostSpoken = [...spoken.entries()].sort((a, b) => b[1] - a[1])[0];
    const firstResponder = currentQuestion.ministerName;
    const ministerName =
      firstResponder && mostSpoken && mostSpoken[1] <= (spoken.get(firstResponder) ?? 0) * 1.5
        ? firstResponder
        : mostSpoken?.[0] ?? firstResponder;
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
      if (isQuestionTimeHeading(heading)) {
        // Question time is often split into several QWN blocks by interruptions
        // (DISTINGUISHED VISITORS etc.) — each block continues the same numbering.
        section = "QWN";
        console.log(`  → XML: Found question time`);
      } else if (heading === "BILLS") {
        section = "BILLS";
      } else {
        section = "OTHER";
      }
      currentTopic = null;
      pendingBillHeading = null;
      continue;
    }

    if (Array.isArray(node["minor-heading"])) {
      const heading = xmlText(node["minor-heading"] as XmlChild[]);
      if (section === "QWN") {
        flushQuestion();
        currentTopic = heading || null;
        currentQuestion = newQuestion();
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
    if (Array.isArray(node["speech"]) && section === "QWN") {
      const speechChildren = node["speech"] as XmlChild[];
      const speaker = attrs["@_speakername"];
      const speakerId = attrs["@_speakerid"];
      const talktype = attrs["@_talktype"];
      const time = attrs["@_time"];
      if (!speaker) continue;

      const text = speechText(speechChildren);
      if (!text) continue;

      // Speeches before any topic heading still belong to a question.
      currentQuestion ??= newQuestion();
      const q: InProgressQuestion = currentQuestion;

      // The chair and crowd noise never ask or answer — OA sometimes tags them
      // talktype="speech" (e.g. "I give the call to the member for…"), which used to
      // make the Speaker the asker or "Government Members" the answering minister.
      if (talktype === "interjection" || isGroupSpeaker(speaker, speakerId) || presidingIds.has(speakerId)) {
        q.exchange.push({ type: "interjection", speakerName: speaker, electorate: null, text });
        continue;
      }

      // A continuation only continues if the same speaker already has the floor in this
      // question; otherwise treat it as a fresh speech (falls through below).
      if (talktype === "continuation" && (speaker === q.askerName || speaker === q.ministerName)) {
        const last = q.exchange[q.exchange.length - 1];
        if (last && last.type === "speech" && last.speakerName === speaker) {
          last.text += "\n\n" + text;
        } else {
          q.exchange.push({ type: "speech", speakerName: speaker, electorate: null, text });
        }
        continue;
      }

      if (q.askerName === null) {
        q.askerName = speaker;
        q.hansardTime = time ? `${time}:00` : null;
      } else if (speaker !== q.askerName && speaker !== q.ministerName) {
        // A third voice. Hansard files consecutive questions on the same topic under one
        // heading, so this is either the next question or (rarely) a second minister
        // adding to the answer. Before any answer has been given only an unmistakable
        // "My question is to…" starts a new question — otherwise it's the minister.
        const startsNewQuestion = q.ministerName === null
          ? STRONG_QUESTION_RE.test(text.slice(0, 200)) && !/^\W*(?:I )?thank/i.test(text)
          : looksLikeNewQuestion(text);
        if (startsNewQuestion) {
          flushQuestion();
          const next = newQuestion();
          next.askerName = speaker;
          next.hansardTime = time ? `${time}:00` : null;
          next.exchange.push({ type: "speech", speakerName: speaker, electorate: null, text });
          currentQuestion = next;
          continue;
        }
        if (q.ministerName === null) q.ministerName = speaker;
      }
      q.exchange.push({ type: "speech", speakerName: speaker, electorate: null, text });
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
