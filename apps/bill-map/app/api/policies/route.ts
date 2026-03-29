import { NextResponse } from "next/server";
import { fetchPolicies } from "@/lib/tvfy";
import { cache, TTL } from "@/lib/cache";

export async function GET() {
  const cached = cache.get("policies");
  if (cached) return NextResponse.json(cached);

  try {
    const policies = await fetchPolicies();
    cache.set("policies", policies, TTL.POLICIES);
    return NextResponse.json(policies);
  } catch (err) {
    console.error("TVFY policies fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch policies" }, { status: 502 });
  }
}
