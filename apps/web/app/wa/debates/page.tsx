import { createClient } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const revalidate = 1800;

type Chamber = "wa_la" | "wa_lc";

interface PageProps {
  searchParams: Promise<{ chamber?: string }>;
}

// Bare /debates → most recent sitting day's debates (mirrors the WA home redirect).
export default async function WADebatesIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const chamber: Chamber = params.chamber === "lc" ? "wa_lc" : "wa_la";
  const chamberQuery = chamber === "wa_lc" ? "?chamber=lc" : "";

  const supabase = createClient();

  const { data: sittingDay } = await supabase
    .from("sitting_days")
    .select("sitting_date")
    .eq("parliament_id", chamber)
    .eq("pipeline_status", "complete")
    .order("sitting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sittingDay) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p className="text-lg font-medium">No recent sitting days found.</p>
        <p className="text-sm mt-2">Check back when parliament is sitting.</p>
      </div>
    );
  }

  redirect(`/${(sittingDay as { sitting_date: string }).sitting_date}/debates${chamberQuery}`);
}
