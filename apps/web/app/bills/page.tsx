import { createClient } from "@/lib/supabase";
import { BillsExplorer, type BillRow } from "./BillsExplorer";

export const revalidate = 3600;

export default async function BillsPage() {
  const supabase = createClient();

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, short_title, bill_stage, ai_summary, introduced_date, parliament_id, sitting_days(sitting_date, parliament_id), members(name_display, party_id, parties(name, short_name, colour_hex))"
    )
    .in("parliament_id", ["fed_hor", "fed_sen"])
    .order("sitting_day_id", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bills</h1>
      <BillsExplorer bills={(bills ?? []) as unknown as BillRow[]} />
    </div>
  );
}
