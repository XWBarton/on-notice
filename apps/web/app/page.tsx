import { createClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { format, parseISO, subDays, isYesterday } from "date-fns";

export const revalidate = 3600;

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

  const lastSatDate = parseISO(sittingDay.sitting_date);
  const lastSatWasYesterday = isYesterday(lastSatDate);

  // If parliament sat yesterday, go straight to the feed
  if (lastSatWasYesterday) {
    redirect(`/${sittingDay.sitting_date}`);
  }

  // Otherwise show a notice with a link
  return (
    <div className="text-center py-24 space-y-4">
      <p className="text-xl font-semibold text-gray-800">Parliament did not sit yesterday.</p>
      <p className="text-sm text-gray-500">
        Last sitting day was{" "}
        <a
          href={`/${sittingDay.sitting_date}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {format(lastSatDate, "EEEE d MMMM yyyy")}
        </a>
        .
      </p>
      <p className="text-sm text-gray-400">
        <a href="/calendar" className="hover:text-gray-600 underline">
          View sitting calendar →
        </a>
      </p>
    </div>
  );
}
