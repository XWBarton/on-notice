/**
 * Fetches Federal Hansard debate content from the OpenAustralia API.
 * Uses getDebates endpoint which provides structured question time content.
 * Docs: https://www.openaustralia.org.au/api/
 *
 * NOTE: APH/ParlInfo is behind Azure WAF and blocks automated access.
 * OpenAustralia mirrors and parses the Hansard, making it accessible via API.
 */

import { OPEN_AUSTRALIA_API } from "../config";

export interface OADebateSection {
  id: string;
  parent_id?: { "#text": string } | string;
  title?: { "#text": string } | string;
  body?: string;
  htype?: string;
  speaker?: {
    member_id: string;
    name: string;
    party: string;
    constituency: string;
  };
  speech?: OADebateSection | OADebateSection[];
  subsection?: OADebateSection | OADebateSection[];
}

export type OADebatesResponse = OADebateSection[];

/**
 * Fetch debates for a given date and chamber from OpenAustralia.
 * type: 'representatives' | 'senate' | 'lords' (lords = crossbench)
 */
export async function fetchDebates(
  date: string,
  type: "representatives" | "senate"
): Promise<OADebatesResponse | null> {
  const apiKey = process.env.OPEN_AUSTRALIA_API_KEY;
  const url = `${OPEN_AUSTRALIA_API}/getDebates?type=${type}&date=${date}&key=${apiKey}&output=json`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok || res.status === 404) break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`  OA debates fetch attempt ${attempt} failed, retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  if (!res) throw new Error("OpenAustralia getDebates: all retries failed");
  console.log(`  [diag] getDebates type=${type} date=${date} → HTTP ${res.status}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAustralia getDebates error: ${res.status}`);

  const raw = await res.json();
  // API returns array of debate sections, or error object
  if (!Array.isArray(raw)) {
    console.log(`  [diag] getDebates raw response: ${JSON.stringify(raw).slice(0, 500)}`);
    const err = (raw as Record<string, unknown>).error;
    if (err) console.log(`OpenAustralia debates error: ${err}`);
    return null;
  }
  return raw as OADebatesResponse;
}

export interface OASpeechRow {
  gid: string;
  htype: string;
  body?: string;
  speaker?: {
    first_name: string;
    last_name: string;
    party: string;
    constituency: string;
  };
}

/**
 * Fetch all speech rows for a question-time sub-section by GID.
 * Returns rows including the question (first htype=12) and answer (subsequent htype=12).
 * Response format: { rows: [...] } or direct array depending on API version.
 */
export async function fetchSpeechRows(
  gid: string,
  type: "representatives" | "senate"
): Promise<OASpeechRow[]> {
  const apiKey = process.env.OPEN_AUSTRALIA_API_KEY;
  const url = `${OPEN_AUSTRALIA_API}/getDebates?type=${type}&gid=${encodeURIComponent(gid)}&key=${apiKey}&output=json`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const raw = await res.json() as unknown;
  if (Array.isArray(raw)) return raw as OASpeechRow[];
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).rows)) {
    return (raw as Record<string, unknown[]>).rows as OASpeechRow[];
  }
  return [];
}

/**
 * Fetch the raw scraped Hansard XML for a given date and chamber.
 * Source: data.openaustralia.org.au/scrapedxml — APH's raw Hansard mirror, published
 * same-day, well ahead of the JSON API (which can lag a sitting day by 24h+ while OA's
 * own proof→final Hansard publishing catches up).
 *
 * NOTE: OA's "rewritexml" mirror (a separate, cleaned-up nested format) used to be the
 * primary XML source here, but it has been consistently 404 for months across every
 * date tested — it appears to be dead. scrapedxml is the flat publicwhip/TheyWorkForYou
 * format instead; see parseScrapedXml in hansard-xml.ts for the parser.
 *
 * Returns the raw XML string, or null if not found.
 */
export async function fetchScrapedXml(
  date: string,
  type: "representatives" | "senate"
): Promise<string | null> {
  const subdir = type === "senate" ? "senate_debates" : "representatives_debates";
  const url = `https://data.openaustralia.org.au/scrapedxml/${subdir}/${date}.xml`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok || res.status === 404) break;
    } catch (e) {
      if (attempt === 3) throw e;
      console.warn(`  OA scraped XML fetch attempt ${attempt} failed, retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
  if (!res) throw new Error("fetchScrapedXml: all retries failed");
  console.log(`  [diag] scrapedxml ${url} → HTTP ${res.status}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchScrapedXml error: ${res.status}`);
  return res.text();
}

/** UTC instant for a wall-clock time in Australia/Sydney (handles AEST/AEDT). */
function sydneyWallClockToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const asIfUtc = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(asIfUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const sydneyAtGuess = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asIfUtc - (sydneyAtGuess - asIfUtc));
}

/**
 * List every sitting date OA's scrapedxml mirror currently holds for a chamber, with the
 * time each file was last (re)published. One small request answers "which days exist, and
 * has any changed since we processed it?" for the whole catch-up window — OA routinely
 * publishes a day's file days or weeks late, and occasionally republishes old ones.
 *
 * The Apache index prints modification times in the server's local (Sydney) time.
 */
export async function listScrapedXml(type: "representatives" | "senate"): Promise<Map<string, Date>> {
  const subdir = type === "senate" ? "senate_debates" : "representatives_debates";
  const url = `https://data.openaustralia.org.au/scrapedxml/${subdir}/`;

  let html: string | null = null;
  for (let attempt = 1; attempt <= 3 && html === null; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e) {
      if (attempt === 3) throw new Error(`listScrapedXml failed: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }

  const listing = new Map<string, Date>();
  const rowRe = /href="(\d{4}-\d{2}-\d{2})\.xml"[^>]*>[^<]*<\/a>\s*(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/g;
  for (const m of html!.matchAll(rowRe)) {
    listing.set(m[1], sydneyWallClockToUtc(+m[2], +m[3], +m[4], +m[5], +m[6]));
  }
  if (listing.size === 0) throw new Error("listScrapedXml: directory index had no dated files (format changed?)");
  return listing;
}

/**
 * Check if parliament sat on a given date by seeing if debates exist.
 */
export async function checkSittingDay(
  date: string,
  type: "representatives" | "senate"
): Promise<boolean> {
  const result = await fetchDebates(date, type);
  return result !== null && result.length > 0;
}
