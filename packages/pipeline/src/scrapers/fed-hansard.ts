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

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAustralia getDebates error: ${res.status}`);

  const raw = await res.json();
  // API returns array of debate sections, or error object
  if (!Array.isArray(raw)) {
    const err = (raw as Record<string, unknown>).error;
    if (err) console.log(`OpenAustralia debates error: ${err}`);
    return null;
  }
  return raw as OADebatesResponse;
}

export interface OASpeech {
  gid: string;
  htime?: string;
  speaker?: { name: string; party: string; constituency: string };
  speeches?: Array<{
    speaker?: { name: string; party: string; constituency: string };
    body?: string;
  }>;
  body?: string;
}

/**
 * Fetch the full speech for a debate section by GID.
 * Returns speaker name, party, and full text.
 */
export async function fetchSpeech(
  gid: string,
  type: "representatives" | "senate"
): Promise<OASpeech | null> {
  const apiKey = process.env.OPEN_AUSTRALIA_API_KEY;
  const url = `${OPEN_AUSTRALIA_API}/getDebates?type=${type}&gid=${encodeURIComponent(gid)}&key=${apiKey}&output=json`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) return null;

  // The response is an array; find the item matching our gid
  return raw[0] as OASpeech;
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
