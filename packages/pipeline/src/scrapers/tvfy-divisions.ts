/**
 * Fetch federal division data from They Vote For You API.
 * Much easier than parsing Hansard XML for divisions.
 * Docs: https://theyvoteforyou.org.au/help/data
 */

import { THEY_VOTE_FOR_YOU_API } from "../config";

export interface TVFYDivision {
  id: number;
  name: string;
  date: string;
  number: number;
  house: "representatives" | "senate";
  outcome: "passed" | "negatived";
  aye_votes: TVFYVote[];
  no_votes: TVFYVote[];
}

export interface TVFYVote {
  member: {
    id: number;
    name: { first: string; last: string };
    party: string;
    electorate: string;
  };
}

export async function fetchDivisionsForDate(
  date: string,   // YYYY-MM-DD
  house: "representatives" | "senate"
): Promise<TVFYDivision[]> {
  const apiKey = process.env.TVFY_API_KEY ?? "";

  const url = `${THEY_VOTE_FOR_YOU_API}/divisions.json?key=${apiKey}&date=${date}&house=${house}&per_page=50`;
  const res = await fetch(url);

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TVFY API error: ${res.status}`);

  const data = await res.json();
  return data ?? [];
}
