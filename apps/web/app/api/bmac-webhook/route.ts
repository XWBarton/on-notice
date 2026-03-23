import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Buy Me a Coffee sends a webhook with a signature header
const BMAC_SECRET = process.env.BMAC_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get("x-bmac-secret");
  if (BMAC_SECRET && secret !== BMAC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const type = body.type as string | undefined;

  // Only handle new support events
  if (type !== "membership.started" && type !== "support.received") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // BMAC sends amount in the supporter's currency — we treat all as AUD
  // For a $1/month membership: amount = 1, duration = "monthly"
  const amount: number = body.amount ?? body.support_coffees ?? 1;
  const isMonthly = body.duration === "monthly" || type === "membership.started";

  // Monthly contribution: add to running total
  // One-off: count as a one-off (doesn't affect monthly total)
  const monthlyDelta = isMonthly ? amount : 0;

  const { data: current } = await supabase
    .from("supporters")
    .select("total_monthly_aud, supporter_count")
    .eq("id", 1)
    .single();

  await supabase.from("supporters").update({
    total_monthly_aud: (current?.total_monthly_aud ?? 0) + monthlyDelta,
    supporter_count: (current?.supporter_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);

  return NextResponse.json({ ok: true });
}
