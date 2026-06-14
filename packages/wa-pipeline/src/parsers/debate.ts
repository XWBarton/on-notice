/**
 * Parsers for WA Hansard debate proceedings — grievances, ministerial
 * statements and member statements. These share the same daily TOC and
 * per-section XML extract endpoints the QWN pipeline already uses; the only
 * difference is which sections we keep and that a debate section is a list of
 * speeches rather than question/answer pairs.
 */

export type ProceedingType = "grievance" | "ministerial_statement" | "member_statement";

export interface TocDebate {
  section: number;
  type: ProceedingType;
  subject: string;
}

export interface DebateSpeech {
  speaker: string;
  text: string;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#x2014;": "—", "&#x2013;": "–",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&#x2014;|&#x2013;/g, (e) => ENTITIES[e] ?? e)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s: string): string {
  return decodeEntities(
    s
      .replace(/<[^>]+>/g, " ")
      // Hansard tab-delimits numbered sub-points: "(1)\tWhat was…".
      .replace(/(\(\d+\)(?:\s*[–—-]\s*\(\d+\))?)\t/g, "\n$1 ")
      .replace(/\t/g, " ")
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

/**
 * Enumerate the grievance / ministerial-statement / member-statement sections
 * from the daily TOC HTML.
 *
 * Each proceeding is a `<li class="toc-topic-item">` whose outer anchor carries
 * the subject (`title=`) and section number (`data-topicref=`), and whose nested
 * sub-proceeding anchor names the proceeding type ("Grievance", "Brief
 * ministerial statement", "Statement"). We classify off that label so the two
 * separate "Statements" TOC groups (ministerial vs member) resolve correctly.
 */
export function parseTocDebates(html: string): TocDebate[] {
  const outerRe = /<a\s+title="([^"]*)"[^>]*\bdata-topicref="(\d+)"[^>]*>/g;
  const outers: { subject: string; section: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = outerRe.exec(html)) !== null) {
    outers.push({ subject: decodeEntities(m[1]).trim(), section: parseInt(m[2], 10), index: m.index });
  }

  const results: TocDebate[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < outers.length; i++) {
    const start = outers[i].index;
    const end = i + 1 < outers.length ? outers[i + 1].index : html.length;
    const slice = html.slice(start, end);

    // The sub-proceeding item's title names the proceeding type.
    const typeMatch = slice.match(/toc-subproceeding-item[\s\S]*?<a\s+title="([^"]*)"/);
    const label = (typeMatch?.[1] ?? "").toLowerCase();

    let type: ProceedingType | null = null;
    if (label.includes("grievance")) type = "grievance";
    else if (label.includes("ministerial")) type = "ministerial_statement";
    else if (label === "statement") type = "member_statement";
    if (!type) continue;

    if (seen.has(outers[i].section)) continue;
    seen.add(outers[i].section);
    results.push({ section: outers[i].section, type, subject: outers[i].subject });
  }
  return results;
}

/**
 * Parse a debate section XML extract into ordered speeches. Each `<talker>` is
 * one speaker's contribution; its first `<name>` is the speaker and its `<text>`
 * blocks are the speech (with the `<by>` attribution line and timestamps stripped).
 */
export function parseDebateXML(xml: string): DebateSpeech[] {
  const speeches: DebateSpeech[] = [];
  const talkerRe = /<talker\b[^>]*>([\s\S]*?)<\/talker>/g;
  let m: RegExpExecArray | null;
  while ((m = talkerRe.exec(xml)) !== null) {
    const block = m[1];
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
    const speaker = nameMatch ? stripTags(nameMatch[1]).trim() : "";

    const parts: string[] = [];
    const textRe = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(block)) !== null) {
      // Drop the "<by>Ms X (Electorate—Role) (9:24 am)</by>" speaker attribution.
      const cleaned = stripTags(tm[1].replace(/<by\b[^>]*>[\s\S]*?<\/by>/g, " ")).trim();
      if (cleaned) parts.push(cleaned);
    }
    // The body often opens with a lone ":" left by the attribution span.
    const text = parts.join("\n").replace(/^:\s*/, "").trim();
    if (speaker && text) speeches.push({ speaker, text });
  }
  return speeches;
}
