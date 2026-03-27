import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const raw = formData.get("data");
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "missing data" }, { status: 400 });
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Verify Ko-fi webhook token
  const token = process.env.KOFI_WEBHOOK_TOKEN;
  if (token && data.verification_token !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Only handle Donation and Subscription events
  const type = String(data.type ?? "");
  if (!["Donation", "Subscription"].includes(type)) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Insert transaction — ignore duplicates (Ko-fi may retry)
  await supabase.from("kofi_transactions").upsert(
    {
      kofi_transaction_id: String(data.kofi_transaction_id ?? ""),
      from_name: data.from_name ? String(data.from_name) : null,
      amount: parseFloat(String(data.amount ?? "0")),
      currency: String(data.currency ?? "AUD"),
      type,
      is_subscription_payment: Boolean(data.is_subscription_payment),
      is_first_subscription_payment: Boolean(data.is_first_subscription_payment),
      message: data.message ? String(data.message) : null,
    },
    { onConflict: "kofi_transaction_id", ignoreDuplicates: true }
  );

  // Recompute aggregate from all stored transactions
  const { data: all } = await supabase
    .from("kofi_transactions")
    .select("from_name, amount, currency, is_first_subscription_payment");

  if (all) {
    // supporter_count = distinct donors by name
    const supporterCount = new Set(all.map((r) => r.from_name).filter(Boolean)).size;
    // total_monthly_aud = sum of first monthly subscription payments in AUD
    const totalMonthly = all
      .filter((r) => r.is_first_subscription_payment && r.currency === "AUD")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    await supabase
      .from("supporters")
      .update({ supporter_count: supporterCount, total_monthly_aud: totalMonthly, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return NextResponse.json({ ok: true });
}
