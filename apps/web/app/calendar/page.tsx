import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";

export const revalidate = 3600;

export default async function CalendarPage() {
  const supabase = createClient();

  const { data: sittingDays } = await supabase
    .from("sitting_days")
    .select("sitting_date, parliament_id, pipeline_status")
    .eq("pipeline_status", "complete")
    .order("sitting_date", { ascending: false });

  // Build a lookup: date → parliaments that sat
  const sittingMap = new Map<string, Set<string>>();
  for (const day of sittingDays ?? []) {
    if (!sittingMap.has(day.sitting_date)) sittingMap.set(day.sitting_date, new Set());
    sittingMap.get(day.sitting_date)!.add(day.parliament_id);
  }

  // Group sitting days by year-month
  const monthMap = new Map<string, string[]>();
  for (const date of sittingMap.keys()) {
    const month = date.slice(0, 7); // "2026-03"
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(date);
  }

  const months = Array.from(monthMap.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Sitting Calendar</h1>

      {months.map((monthKey) => {
        const monthStart = parseISO(`${monthKey}-01`);
        const monthEnd = endOfMonth(monthStart);
        const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
        // Pad start: Monday = 0
        const startPad = (getDay(monthStart) + 6) % 7;

        return (
          <section key={monthKey}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {format(monthStart, "MMMM yyyy")}
            </h2>

            <div className="grid grid-cols-7 gap-1 text-center">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="text-xs text-gray-400 font-medium pb-1">{d}</div>
              ))}

              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}

              {days.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const parliaments = sittingMap.get(dateStr);
                const isWeekend = getDay(day) === 0 || getDay(day) === 6;
                const hasHor = parliaments?.has("fed_hor");
                const hasSen = parliaments?.has("fed_sen");
                const hasBoth = hasHor && hasSen;

                return (
                  <div key={dateStr} className="aspect-square flex flex-col items-center justify-center">
                    {parliaments ? (
                      <Link
                        href={`/${dateStr}`}
                        className="w-full h-full flex flex-col items-center justify-center rounded-lg hover:opacity-80 transition-opacity"
                        style={{
                          background: hasBoth
                            ? "linear-gradient(135deg, #006945 50%, #C1121F 50%)"
                            : hasHor
                            ? "#006945"
                            : "#C1121F",
                        }}
                        title={`${format(day, "d MMMM yyyy")} — ${hasBoth ? "House & Senate" : hasHor ? "House of Representatives" : "Senate"}`}
                      >
                        <span className="text-sm font-medium text-white">{format(day, "d")}</span>
                      </Link>
                    ) : (
                      <span className={`text-sm ${isWeekend ? "text-gray-200" : "text-gray-400"}`}>
                        {format(day, "d")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#006945] inline-block" /> House
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#C1121F] inline-block" /> Senate
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
