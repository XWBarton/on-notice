import { createClient } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const revalidate = 900;

export default async function HomePage() {
  const supabase = createClient();

  const { data: sittingDay } = await supabase
    .from("sitting_days")
    .select("sitting_date")
    .eq("parliament_id", "fed_hor")
    .eq("pipeline_status", "complete")
    .order("sitting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sittingDay) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p className="text-lg font-medium">No sitting days on record yet.</p>
        <p className="text-sm mt-2">Check back soon.</p>
      </div>
    );
  }

  redirect(`/${sittingDay.sitting_date}`);
}
