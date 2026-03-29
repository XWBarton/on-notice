// Australian Parliament House Bills API client
// Note: APH's Hansard API is WAF-blocked, but the bills legislation API is a
// separate public endpoint. Falls back to empty array if unavailable.

import type { APHBill } from "./types";

const APH_BILLS_API = "https://www.aph.gov.au/api/bills";

interface APHBillsResponse {
  bills?: APHBill[];
  data?: APHBill[];
  total?: number;
}

export async function fetchAPHBills(parliamentNumber?: number): Promise<APHBill[]> {
  const params = new URLSearchParams({ pageSize: "200", pageNumber: "1" });
  if (parliamentNumber) params.set("parliaments", String(parliamentNumber));

  try {
    const res = await fetch(`${APH_BILLS_API}?${params}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 21600 }, // 6h
    });

    if (!res.ok) {
      console.warn(`APH bills API returned ${res.status} — will infer bills from TVFY divisions`);
      return [];
    }

    const data = (await res.json()) as APHBillsResponse;
    return data.bills ?? data.data ?? [];
  } catch (err) {
    console.warn("APH bills API unavailable:", err);
    return [];
  }
}
