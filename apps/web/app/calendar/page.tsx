import { createClient } from "@/lib/supabase";
import { CalendarView } from "@/components/Calendar/CalendarView";

export const revalidate = 3600;

// Known 2026 federal parliamentary sitting dates (both chambers)
// Source: PM&C Parliamentary Sittings 2026 (published 26 Nov 2025)
export const SCHEDULED_SITTING_DATES: Record<string, ("fed_hor" | "fed_sen")[]> = {
  // February
  "2026-02-03": ["fed_hor", "fed_sen"],
  "2026-02-04": ["fed_hor", "fed_sen"],
  "2026-02-05": ["fed_hor", "fed_sen"],
  "2026-02-09": ["fed_hor", "fed_sen"],
  "2026-02-10": ["fed_hor", "fed_sen"],
  "2026-02-11": ["fed_hor", "fed_sen"],
  "2026-02-12": ["fed_hor", "fed_sen"],
  // March
  "2026-03-02": ["fed_hor", "fed_sen"],
  "2026-03-03": ["fed_hor", "fed_sen"],
  "2026-03-04": ["fed_hor", "fed_sen"],
  "2026-03-05": ["fed_hor", "fed_sen"],
  "2026-03-10": ["fed_hor", "fed_sen"],
  "2026-03-11": ["fed_hor", "fed_sen"],
  "2026-03-12": ["fed_hor", "fed_sen"],
  "2026-03-23": ["fed_hor", "fed_sen"],
  "2026-03-24": ["fed_hor", "fed_sen"],
  "2026-03-25": ["fed_hor", "fed_sen"],
  "2026-03-26": ["fed_hor", "fed_sen"],
  "2026-03-30": ["fed_hor", "fed_sen"],
  "2026-03-31": ["fed_hor", "fed_sen"],
  "2026-04-01": ["fed_hor", "fed_sen"],
  // May
  "2026-05-12": ["fed_hor", "fed_sen"],
  "2026-05-13": ["fed_hor", "fed_sen"],
  "2026-05-14": ["fed_hor", "fed_sen"],
  "2026-05-25": ["fed_hor", "fed_sen"],
  "2026-05-26": ["fed_hor", "fed_sen"],
  "2026-05-27": ["fed_hor", "fed_sen"],
  "2026-05-28": ["fed_hor", "fed_sen"],
  // June
  "2026-06-02": ["fed_hor", "fed_sen"],
  "2026-06-03": ["fed_hor", "fed_sen"],
  "2026-06-04": ["fed_hor", "fed_sen"],
  "2026-06-22": ["fed_hor", "fed_sen"],
  "2026-06-23": ["fed_hor", "fed_sen"],
  "2026-06-24": ["fed_hor", "fed_sen"],
  "2026-06-25": ["fed_hor", "fed_sen"],
  "2026-06-29": ["fed_hor", "fed_sen"],
  "2026-06-30": ["fed_hor", "fed_sen"],
  "2026-07-01": ["fed_hor", "fed_sen"],
  "2026-07-02": ["fed_hor", "fed_sen"],
  // August
  "2026-08-11": ["fed_hor", "fed_sen"],
  "2026-08-12": ["fed_hor", "fed_sen"],
  "2026-08-13": ["fed_hor", "fed_sen"],
  "2026-08-17": ["fed_hor", "fed_sen"],
  "2026-08-18": ["fed_hor", "fed_sen"],
  "2026-08-19": ["fed_hor", "fed_sen"],
  "2026-08-20": ["fed_hor", "fed_sen"],
  // September
  "2026-09-07": ["fed_hor", "fed_sen"],
  "2026-09-08": ["fed_hor", "fed_sen"],
  "2026-09-09": ["fed_hor", "fed_sen"],
  "2026-09-10": ["fed_hor", "fed_sen"],
  "2026-09-14": ["fed_hor", "fed_sen"],
  "2026-09-15": ["fed_hor", "fed_sen"],
  "2026-09-16": ["fed_hor", "fed_sen"],
  "2026-09-17": ["fed_hor", "fed_sen"],
  // October
  "2026-10-12": ["fed_hor", "fed_sen"],
  "2026-10-13": ["fed_hor", "fed_sen"],
  "2026-10-14": ["fed_hor", "fed_sen"],
  "2026-10-15": ["fed_hor", "fed_sen"],
  "2026-10-26": ["fed_hor", "fed_sen"],
  "2026-10-27": ["fed_hor", "fed_sen"],
  "2026-10-28": ["fed_hor", "fed_sen"],
  "2026-10-29": ["fed_hor", "fed_sen"],
  // November
  "2026-11-23": ["fed_hor", "fed_sen"],
  "2026-11-24": ["fed_hor", "fed_sen"],
  "2026-11-25": ["fed_hor", "fed_sen"],
  "2026-11-26": ["fed_hor", "fed_sen"],
};

export default async function CalendarPage() {
  const supabase = createClient();

  const { data: sittingDays } = await supabase
    .from("sitting_days")
    .select("sitting_date, parliament_id, pipeline_status")
    .eq("pipeline_status", "complete");

  // Build lookup: date → set of parliament_ids with data
  const dataMap: Record<string, Set<string>> = {};
  for (const day of sittingDays ?? []) {
    if (!dataMap[day.sitting_date]) dataMap[day.sitting_date] = new Set();
    dataMap[day.sitting_date].add(day.parliament_id);
  }

  // Serialise for client component
  const dataMapSerialisable: Record<string, string[]> = {};
  for (const [date, set] of Object.entries(dataMap)) {
    dataMapSerialisable[date] = Array.from(set);
  }

  return (
    <CalendarView
      dataMap={dataMapSerialisable}
      scheduledDates={SCHEDULED_SITTING_DATES}
    />
  );
}
