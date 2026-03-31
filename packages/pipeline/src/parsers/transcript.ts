import type { OASpeechRow } from "../scrapers/fed-hansard";
import type { XmlExchangeEntry } from "./hansard-xml";

export type TranscriptEntryType = "speech" | "interjection" | "procedural";

export interface TranscriptEntry {
  type: TranscriptEntryType;
  speaker: string | null;
  party: string | null;
  text: string;
}

/**
 * Parses OA speech rows into structured transcript entries.
 *
 * OA body HTML contains:
 *   <p> tags for main speech paragraphs
 *   <p class="italic"> or <i>...</i> for interjections / procedural notes
 */
export function buildTranscript(
  questionRow: OASpeechRow | undefined,
  answerRows: OASpeechRow[]
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  if (questionRow) {
    entries.push(...parseRow(questionRow, "questioner"));
  }
  for (const row of answerRows) {
    entries.push(...parseRow(row, "respondent"));
  }

  return entries;
}

function parseRow(row: OASpeechRow, _role: string): TranscriptEntry[] {
  const speaker = (row.speaker?.first_name || row.speaker?.last_name)
    ? `${row.speaker.first_name ?? ""} ${row.speaker.last_name ?? ""}`.trim()
    : null;
  const party = row.speaker?.party ?? null;
  const html = row.body ?? "";

  return parseParagraphs(html, speaker, party);
}

function parseParagraphs(
  html: string,
  speaker: string | null,
  party: string | null
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Split on <p ...> tags
  const paragraphs = html.split(/<p[^>]*>/i).filter(Boolean);

  for (const para of paragraphs) {
    // Strip closing tags and get text
    const isItalic = /class=["']italic["']/i.test(para) || /^<i>/i.test(para.trim());
    const text = stripHtml(para).trim();
    if (!text) continue;

    const type = isItalic
      ? classifyItalicLine(text)
      : "speech";

    entries.push({ type, speaker, party, text });
  }

  return entries;
}

function classifyItalicLine(text: string): TranscriptEntryType {
  // Interjections are short, often attributed ("Member for X interjecting")
  if (/interject/i.test(text)) return "interjection";
  if (/^(Order|Resume|The (minister|member|senator|leader|manager|house)|Honourable members?|Opposition members?|Government members?)/i.test(text)) {
    return "procedural";
  }
  // Short lines without attribution = likely interjection
  if (text.split(/\s+/).length <= 12) return "interjection";
  return "procedural";
}

/**
 * Build a transcript from a rewritexml exchange (speeches + interjections).
 * Party lookup is provided by the caller via the member cache.
 */
export function buildTranscriptFromExchange(
  exchange: XmlExchangeEntry[],
  lookupParty: (speakerName: string) => string | null
): TranscriptEntry[] {
  return exchange
    .filter((e) => e.text.trim())
    .map((e) => ({
      type: e.type,
      speaker: normaliseSpeakerName(e.speakerName),
      party: lookupParty(e.speakerName),
      text: e.text.trim(),
    }));
}

/**
 * Convert rewritexml speaker names to title case.
 * "Senator GHOSH" → "Senator Ghosh", "The PRESIDENT" → "The President"
 */
function normaliseSpeakerName(name: string): string {
  return name.replace(/\b([A-Z]{2,}(?:-[A-Z]+)*)\b/g, (word) =>
    word
      .split("-")
      .map((part) => part[0] + part.slice(1).toLowerCase())
      .join("-")
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8212;/g, "—").replace(/&#8211;/g, "–")
    .replace(/&#8216;/g, "\u2018").replace(/&#8217;/g, "\u2019")
    .replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
}
