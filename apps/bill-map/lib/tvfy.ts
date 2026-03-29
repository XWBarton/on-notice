// They Vote For You API client
// Docs: https://theyvoteforyou.org.au/help/data

import type { TVFYDivision, TVFYDivisionSummary, TVFYPolicy, House } from "./types";

const BASE = "https://theyvoteforyou.org.au/api/v1";

function apiKey(): string {
  return process.env.TVFY_API_KEY ?? "";
}

export async function fetchDivisions(
  startDate: string,
  endDate: string,
  house: House,
): Promise<TVFYDivision[]> {
  const url = `${BASE}/divisions.json?key=${apiKey()}&start_date=${startDate}&end_date=${endDate}&house=${house}&per_page=500`;
  const res = await fetch(url, { next: { revalidate: 3600 } });

  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TVFY divisions error: ${res.status}`);

  const summaries = (await res.json()) as TVFYDivisionSummary[];
  if (!Array.isArray(summaries) || summaries.length === 0) return [];

  // Fetch individual vote details in batches to avoid rate limits
  const divisions: TVFYDivision[] = [];
  const BATCH = 10;
  for (let i = 0; i < summaries.length; i += BATCH) {
    const batch = summaries.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((s) => fetchDivisionDetail(s)));
    divisions.push(...results);
  }
  return divisions;
}

async function fetchDivisionDetail(
  summary: TVFYDivisionSummary,
): Promise<TVFYDivision> {
  const url = `${BASE}/divisions/${summary.id}.json?key=${apiKey()}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { ...summary, votes: [] };
    const detail = (await res.json()) as { votes?: TVFYDivision["votes"] };
    return { ...summary, votes: detail.votes ?? [] };
  } catch {
    return { ...summary, votes: [] };
  }
}

export async function fetchPolicies(): Promise<TVFYPolicy[]> {
  const url = `${BASE}/policies.json?key=${apiKey()}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`TVFY policies error: ${res.status}`);
  return res.json() as Promise<TVFYPolicy[]>;
}
