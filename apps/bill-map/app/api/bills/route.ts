import { NextRequest, NextResponse } from "next/server";
import { fetchAPHBills } from "@/lib/aph";
import { cache, TTL } from "@/lib/cache";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const parliament = searchParams.get("parliament");

  const cacheKey = `bills:${parliament ?? "all"}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const bills = await fetchAPHBills(parliament ? parseInt(parliament) : undefined);
    cache.set(cacheKey, bills, TTL.BILLS);
    return NextResponse.json(bills);
  } catch (err) {
    console.error("APH bills fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch bills" }, { status: 502 });
  }
}
