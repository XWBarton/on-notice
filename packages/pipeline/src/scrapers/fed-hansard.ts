/**
 * Fetches Federal Hansard XML for a given sitting date from the APH API.
 * APH Hansard API reference: https://www.aph.gov.au/api/hansard
 */

import { APH_HANSARD_API } from "../config";

export interface HansardDocument {
  id: string;
  title: string;
  date: string;
  chamber: string;
  xmlUrl: string;
}

/**
 * Search APH Hansard for documents on a given date.
 * Returns a list of document IDs to fetch.
 */
export async function findHansardDocuments(
  date: string,   // YYYY-MM-DD
  chamber: "reps" | "senate"
): Promise<HansardDocument[]> {
  // APH search API
  const searchUrl = `${APH_HANSARD_API}/search?q=*&fromDate=${date}&toDate=${date}&chamber=${chamber}&output=json&pageSize=50`;

  const res = await fetch(searchUrl, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`APH Hansard search failed: ${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const results = (data.value ?? data.results ?? []) as Record<string, unknown>[];

  type RawResult = { type?: string; chamber?: string; id: string; title: string; date: string };
  return (results as RawResult[])
    .filter((r) => r.type === "hansard" || r.chamber === chamber)
    .map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      chamber: chamber,
      xmlUrl: `${APH_HANSARD_API}/link/?id=chamber/hansard${chamber === "reps" ? "r" : "s"}/${r.id}/&linktype=xml`,
    }));
}

/**
 * Download Hansard XML for a given document ID.
 */
export async function downloadHansardXml(doc: HansardDocument): Promise<string> {
  const res = await fetch(doc.xmlUrl);
  if (!res.ok) throw new Error(`Failed to download Hansard XML: ${res.status} ${doc.xmlUrl}`);
  return res.text();
}
