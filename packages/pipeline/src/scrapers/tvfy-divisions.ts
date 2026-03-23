/**
 * Fetch federal division data from They Vote For You API.
 * Docs: https://theyvoteforyou.org.au/help/data
 *
 * The list endpoint returns summary data (counts only).
 * Individual division endpoint returns full vote details.
 */

import { THEY_VOTE_FOR_YOU_API } from "../config";

export interface TVFYDivisionSummary {
  id: number;
  name: string;
  date: string;
  number: number;
  house: "representatives" | "senate";
  outcome: string;   // "passed" | "negatived"
  aye_votes: number; // count only in list endpoint
  no_votes: number;  // count only in list endpoint
}

export interface TVFYVote {
  vote: "aye" | "no";
  member: {
    id: number;
    first_name: string;
    last_name: string;
    electorate: string;
    party: string;
  };
}

export interface TVFYDivision extends TVFYDivisionSummary {
  votes: TVFYVote[];
}

export async function fetchDivisionsForDate(
  date: string,
  house: "representatives" | "senate"
): Promise<TVFYDivision[]> {
  const apiKey = process.env.TVFY_API_KEY ?? "";

  // Step 1: Get list of divisions for the day
  const listUrl = `${THEY_VOTE_FOR_YOU_API}/divisions.json?key=${apiKey}&start_date=${date}&end_date=${date}&house=${house}&per_page=100`;
  const listRes = await fetch(listUrl);

  if (listRes.status === 404) return [];
  if (!listRes.ok) throw new Error(`TVFY API error: ${listRes.status}`);

  const summaries = await listRes.json() as TVFYDivisionSummary[];
  if (!Array.isArray(summaries) || summaries.length === 0) return [];

  console.log(`Found ${summaries.length} divisions for ${date}`);

  // Step 2: Fetch full vote details for each division
  const divisions = await Promise.all(
    summaries.map(async (summary) => {
      const detailUrl = `${THEY_VOTE_FOR_YOU_API}/divisions/${summary.id}.json?key=${apiKey}`;
      const detailRes = await fetch(detailUrl);

      if (!detailRes.ok) {
        console.warn(`Failed to fetch division ${summary.id}: ${detailRes.status}`);
        return { ...summary, votes: [] };
      }

      const detail = await detailRes.json() as { votes?: TVFYVote[] };
      return { ...summary, votes: detail.votes ?? [] };
    })
  );

  return divisions;
}
