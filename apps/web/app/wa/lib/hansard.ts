const BASE = "https://www.parliament.wa.gov.au";

export interface WAQuestion {
  number: number;
  subject: string;
  asker: string;
  minister: string;
  questionText: string;
  answerText: string;
}

export interface WADailySitting {
  date: string;
  questions: WAQuestion[];
}

/**
 * Try recent sitting dates and return the first one that has
 * Questions Without Notice sections.
 */
export async function fetchLatestWASitting(): Promise<WADailySitting | null> {
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = d.toISOString().split("T")[0];
    const result = await fetchWASitting(date);
    if (result && result.questions.length > 0) return result;
  }
  return null;
}

async function fetchWASitting(date: string): Promise<WADailySitting | null> {
  const sections = await fetchQWNSections(date);
  if (sections.length === 0) return null;

  const allQuestions: WAQuestion[] = [];
  for (const section of sections) {
    const questions = await fetchSectionQuestions(date, section);
    allQuestions.push(...questions);
  }

  return { date, questions: allQuestions };
}

/**
 * Fetch the daily Hansard TOC and return section numbers for
 * "Questions without notice".
 */
async function fetchQWNSections(date: string): Promise<number[]> {
  const url = `${BASE}/hansard/daily/lh/${date}/`;
  let html: string;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    html = await res.text();
  } catch {
    return [];
  }

  // Find the "Questions without notice" block in the TOC and extract
  // section hrefs like /hansard/daily/lh/2026-03-19/31
  const qwnBlock = extractQWNBlock(html);
  if (!qwnBlock) return [];

  const sectionRe = /\/hansard\/daily\/lh\/[\d-]+\/(\d+)/g;
  const sections: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(qwnBlock)) !== null) {
    const n = parseInt(m[1], 10);
    if (!sections.includes(n)) sections.push(n);
  }
  return sections;
}

/**
 * Locate the "Questions without notice" list in the TOC HTML.
 * Returns the substring covering the QWN <li> block.
 */
function extractQWNBlock(html: string): string | null {
  const lower = html.toLowerCase();
  const idx = lower.indexOf("questions without notice");
  if (idx === -1) return null;
  // Grab a generous chunk of HTML after the match
  return html.slice(idx, idx + 8000);
}

/**
 * Fetch the XML extract for a Hansard section and parse questions from it.
 */
async function fetchSectionQuestions(
  date: string,
  section: number
): Promise<WAQuestion[]> {
  const url = `${BASE}/hansard/daily/lh/${date}/extract/${section}/download`;
  let xml: string;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  return parseQuestionsXML(xml);
}

/**
 * Parse WA Hansard XML into structured questions.
 *
 * XML structure:
 *   <proceeding>
 *     <subject><name>Topic name</name></subject>
 *     <talker kind="question">
 *       <name>Mr Shane Love to the Premier</name>
 *       <questions><question qonNum="129"/></questions>
 *       <text>question text...</text>
 *     </talker>
 *     <talker kind="answer">
 *       <name>Mr Roger Cook replied</name>
 *       <text>answer text...</text>
 *     </talker>
 *   </proceeding>
 */
function parseQuestionsXML(xml: string): WAQuestion[] {
  const questions: WAQuestion[] = [];

  // Extract subject/topic
  const subjectMatch = xml.match(/<subject[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  const subject = subjectMatch ? stripTags(subjectMatch[1]).trim() : "";

  // Extract all talker blocks
  const talkerRe = /<talker[^>]*>([\s\S]*?)<\/talker>/g;
  const talkers: { kind: string; name: string; qonNum: number | null; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = talkerRe.exec(xml)) !== null) {
    const block = m[1];
    const kindMatch = m[0].match(/kind="([^"]+)"/);
    const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/);
    const qonMatch = block.match(/qonNum="(\d+)"/);

    // Collect all <text> blocks; the first is a header line ("178. Mr Name to Minister")
    // and the rest are the actual content — skip the header.
    const allTexts: string[] = [];
    const textRe = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(block)) !== null) {
      allTexts.push(tm[1]);
    }
    const contentTexts = allTexts.filter((t) => !/^\s*\d+\./.test(stripTags(t)));
    const text = contentTexts.map((t) => stripTags(t).trim()).filter(Boolean).join(" ");

    talkers.push({
      kind: kindMatch?.[1] ?? "",
      name: nameMatch ? stripTags(nameMatch[1]).trim() : "",
      qonNum: qonMatch ? parseInt(qonMatch[1], 10) : null,
      text,
    });
  }

  // Pair question + answer talkers
  for (let i = 0; i < talkers.length; i++) {
    const t = talkers[i];
    if (t.kind !== "question" || t.qonNum === null) continue;
    const answer = talkers[i + 1]?.kind === "answer" ? talkers[i + 1] : null;

    // "Mr Shane Love to the Premier" → asker="Shane Love", minister="Premier"
    const toMatch = t.name.match(/^(?:Mr|Ms|Mrs|Dr|Hon\.?)\s+(.+?)\s+to\s+the\s+(.+)$/i);

    questions.push({
      number: t.qonNum,
      subject,
      asker: toMatch ? toMatch[1] : t.name,
      minister: toMatch ? toMatch[2] : "",
      questionText: t.text,
      answerText: answer?.text ?? "",
    });
  }

  return questions;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ");
}
