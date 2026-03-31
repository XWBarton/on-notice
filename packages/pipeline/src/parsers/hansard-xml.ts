/**
 * Parses OpenAustralia debate data to extract bills and questions.
 *
 * Two parsers:
 *  - parseDebatesXml: primary path — parses rewritexml directly (complete, up-to-date,
 *    includes proper <interjection> and <continue> elements per question exchange)
 *  - parseDebates: fallback — parses the OA JSON API response (may lag behind)
 *
 * Rewritexml structure (per question):
 *   <debate type="QUESTIONS WITHOUT NOTICE">
 *     <subdebate.1>                      ← one per question
 *       <subdebateinfo><title>Topic</title></subdebateinfo>
 *       <speech><talker>...</talker><para>...</para><interjection>...</interjection></speech>
 *       <speech>...</speech>             ← minister response
 *       ...supplementaries...
 *     </subdebate.1>
 *   </debate>
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
  /** Raw name from <name role="metadata">, e.g. "Senator GHOSH", "The PRESIDENT" */
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
  /** Structured exchange from rewritexml — set only when parsed via parseDebatesXml. */
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

// ── Rewritexml parser (primary) ───────────────────────────────────────────────

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

/** Return children of first node whose tag matches, or null. */
function firstChildOf(nodes: XmlChild[], tag: string): XmlChild[] | null {
  const node = nodes.find((n) => Array.isArray(n[tag]));
  return node ? (node[tag] as XmlChild[]) : null;
}

/** Return all nodes in array whose tag matches. */
function allChildrenOf(nodes: XmlChild[], tag: string): XmlChild[][] {
  return nodes
    .filter((n) => Array.isArray(n[tag]))
    .map((n) => n[tag] as XmlChild[]);
}

/**
 * Extract speaker name from a <talker> node.
 * Looks for <name role="metadata">.
 */
function talkerName(talkerChildren: XmlChild[]): string | null {
  for (const child of talkerChildren) {
    if (!Array.isArray(child["name"])) continue;
    const attrs = (child[":@"] ?? {}) as Record<string, string>;
    if (attrs["@_role"] === "metadata") {
      return xmlText(child["name"] as XmlChild[]) || null;
    }
  }
  return null;
}

/** Extract text from <para> elements that are direct children (not inside interjection/continue). */
function directParaText(speechChildren: XmlChild[]): string {
  return speechChildren
    .filter((n) => Array.isArray(n["para"]))
    .map((n) => xmlText(n["para"] as XmlChild[]))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Parse one <subdebate.1> worth of children into an ordered exchange of
 * speeches and interjections. Also returns top-level metadata.
 */
function parseSubdebateExchange(subdebate1Children: XmlChild[]): {
  subject: string | null;
  askerName: string | null;
  ministerName: string | null;
  hansardTime: string | null;
  questionText: string;
  answerText: string;
  exchange: XmlExchangeEntry[];
} | null {
  // Topic from <subdebateinfo><title>
  const infoChildren = firstChildOf(subdebate1Children, "subdebateinfo");
  const subject = infoChildren
    ? xmlText(firstChildOf(infoChildren, "title") ?? []) || null
    : null;

  const exchange: XmlExchangeEntry[] = [];
  let askerName: string | null = null;
  let ministerName: string | null = null;
  let hansardTime: string | null = null;

  for (const node of subdebate1Children) {
    if (!Array.isArray(node["speech"])) continue;
    const speechChildren = node["speech"] as XmlChild[];

    const talkerChildren = firstChildOf(speechChildren, "talker");
    if (!talkerChildren) continue;
    const speaker = talkerName(talkerChildren);
    if (!speaker) continue;

    const electorate = xmlText(firstChildOf(talkerChildren, "electorate") ?? []) || null;
    const time = xmlText(firstChildOf(talkerChildren, "time.stamp") ?? []) || null;

    // Set asker/minister from first two distinct speakers
    if (askerName === null) {
      askerName = speaker;
      hansardTime = time;
    } else if (ministerName === null && speaker !== askerName) {
      ministerName = speaker;
    }

    // Main speech paragraphs (direct <para> children only)
    const mainText = directParaText(speechChildren);
    if (mainText) {
      exchange.push({ type: "speech", speakerName: speaker, electorate, text: mainText });
    }

    // Walk children for interjections and continuations
    for (const child of speechChildren) {
      if (Array.isArray(child["interjection"])) {
        const interjChildren = child["interjection"] as XmlChild[];
        const interjTalker = firstChildOf(interjChildren, "talker");
        const interjSpeaker = interjTalker ? talkerName(interjTalker) : null;
        const interjText = directParaText(interjChildren);
        if (interjSpeaker && interjText) {
          exchange.push({ type: "interjection", speakerName: interjSpeaker, electorate: null, text: interjText });
        }
      }

      if (Array.isArray(child["continue"])) {
        const contChildren = child["continue"] as XmlChild[];
        const contText = directParaText(contChildren);
        if (contText) {
          // Append to the last speech entry for this speaker, or create new
          const last = exchange[exchange.length - 1];
          if (last && last.type === "speech" && last.speakerName === speaker) {
            last.text += "\n\n" + contText;
          } else {
            exchange.push({ type: "speech", speakerName: speaker, electorate, text: contText });
          }
        }
      }
    }
  }

  if (!askerName) return null;

  const questionText = exchange
    .filter((e) => e.type === "speech" && e.speakerName === askerName)
    .map((e) => e.text)
    .join("\n\n");

  const answerText = exchange
    .filter((e) => e.type === "speech" && ministerName && e.speakerName === ministerName)
    .map((e) => e.text)
    .join("\n\n");

  return { subject, askerName, ministerName, hansardTime, questionText, answerText, exchange };
}

/**
 * Parse a rewritexml string into bills, questions, and division times.
 * Structure: <hansard><chamber.xscript><debate>...</debate>...</chamber.xscript></hansard>
 */
export function parseDebatesXml(xmlText_: string): {
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
    });
    parsed = parser.parse(xmlText_) as XmlChild[];
  } catch (e) {
    console.warn(`  Rewritexml parse error: ${e}`);
    return { bills: [], questions: [], divisionTimes: [] };
  }

  // Navigate: root → <hansard> → <chamber.xscript>
  const hansardEl = parsed.find((n) => Array.isArray(n["hansard"]));
  if (!hansardEl) return { bills: [], questions: [], divisionTimes: [] };

  const hansardChildren = hansardEl["hansard"] as XmlChild[];
  const xscriptEl = hansardChildren.find((n) => Array.isArray(n["chamber.xscript"]));
  if (!xscriptEl) return { bills: [], questions: [], divisionTimes: [] };

  const xscriptChildren = xscriptEl["chamber.xscript"] as XmlChild[];

  const bills: ParsedBill[] = [];
  const questions: ParsedQuestion[] = [];
  const divisionTimes: ParsedDivisionTime[] = [];
  let divisionCounter = 0;

  // Iterate all <debate> elements
  for (const node of xscriptChildren) {
    if (!Array.isArray(node["debate"])) continue;
    const debateChildren = node["debate"] as XmlChild[];

    const infoChildren = firstChildOf(debateChildren, "debateinfo");
    if (!infoChildren) continue;

    const debateType = xmlText(firstChildOf(infoChildren, "type") ?? []).toUpperCase();
    const debateTitle = xmlText(firstChildOf(infoChildren, "title") ?? []).toUpperCase();

    // ── Questions Without Notice ──────────────────────────────────────────────
    if (debateType.includes("QUESTIONS WITHOUT NOTICE") && !debateType.includes("TAKE NOTE")) {
      console.log(`  → XML: Found question time`);
      for (const subdebate1Node of debateChildren) {
        if (!Array.isArray(subdebate1Node["subdebate.1"])) continue;
        const subdebate1Children = subdebate1Node["subdebate.1"] as XmlChild[];

        const result = parseSubdebateExchange(subdebate1Children);
        if (!result) continue;

        questions.push({
          questionNumber: questions.length + 1,
          askerName: result.askerName,
          askerParty: null,
          ministerName: result.ministerName,
          ministerParty: null,
          subject: result.subject,
          questionText: result.questionText,
          answerText: result.answerText,
          hansardTime: result.hansardTime,
          gid: null, // rewritexml has no OA-style GIDs
          exchange: result.exchange,
        });
      }
    }

    // ── Bills ─────────────────────────────────────────────────────────────────
    if (debateTitle === "BILLS" || debateType === "BILLS") {
      for (const sub1Node of debateChildren) {
        if (!Array.isArray(sub1Node["subdebate.1"])) continue;
        const sub1Children = sub1Node["subdebate.1"] as XmlChild[];

        const sub1Info = firstChildOf(sub1Children, "subdebateinfo");
        const billTitle = sub1Info
          ? xmlText(firstChildOf(sub1Info, "title") ?? [])
          : "";
        if (!billTitle) continue;

        // Reading stage from <subdebate.2>
        for (const sub2Node of sub1Children) {
          if (!Array.isArray(sub2Node["subdebate.2"])) continue;
          const sub2Children = sub2Node["subdebate.2"] as XmlChild[];
          const sub2Info = firstChildOf(sub2Children, "subdebateinfo");
          const stageName = sub2Info
            ? xmlText(firstChildOf(sub2Info, "title") ?? [])
            : "";

          if (!stageName) continue;
          const combined = `${billTitle} — ${stageName}`;
          bills.push({
            shortTitle: billTitle,
            longTitle: null,
            introducerName: null,
            stage: inferStage(stageName),
            hansardRef: null,
            introductionText: null,
          });
          void combined; // used for inferStage
        }
      }
    }

    // ── Division timestamps ───────────────────────────────────────────────────
    // Rewritexml encodes division time in "The Senate divided. [HH:MM]" text
    for (const sub1Node of debateChildren) {
      if (!Array.isArray(sub1Node["subdebate.1"])) continue;
      const sub1Children = sub1Node["subdebate.1"] as XmlChild[];

      for (const child of sub1Children) {
        if (!Array.isArray(child["division"])) continue;
        const divChildren = child["division"] as XmlChild[];
        const headerEl = firstChildOf(divChildren, "division.header");
        if (!headerEl) continue;
        const headerText = xmlText(headerEl);
        const timeMatch = headerText.match(/\[(\d{1,2}:\d{2})\]/);
        if (timeMatch) {
          divisionCounter++;
          divisionTimes.push({
            divisionNumber: divisionCounter,
            htime: timeMatch[1] + ":00",
          });
        }
      }
    }
  }

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
