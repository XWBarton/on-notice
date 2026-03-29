import { NextRequest, NextResponse } from "next/server";
import { fetchDivisions } from "@/lib/tvfy";
import { cache, TTL } from "@/lib/cache";
import type { House } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const house = (searchParams.get("house") ?? "representatives") as House;
  const days = searchParams.get("days");

  let startDate: string;
  let endDate: string;

  if (days) {
    const d = new Date();
    endDate = d.toISOString().slice(0, 10);
    d.setDate(d.getDate() - parseInt(days));
    startDate = d.toISOString().slice(0, 10);
  } else if (start && end) {
    startDate = start;
    endDate = end;
  } else {
    return NextResponse.json(
      { error: "Provide ?days=N or ?start=YYYY-MM-DD&end=YYYY-MM-DD" },
      { status: 400 },
    );
  }

  const cacheKey = `divisions:${startDate}:${endDate}:${house}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const divisions = await fetchDivisions(startDate, endDate, house);
    cache.set(cacheKey, divisions, TTL.DIVISIONS);
    return NextResponse.json(divisions);
  } catch (err) {
    console.error("TVFY divisions fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch divisions" }, { status: 502 });
  }
}
