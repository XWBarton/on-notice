import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { format, parseISO } from "date-fns";

export const revalidate = 3600;

export default async function DivisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ parliament?: string }>;
}) {
  const { parliament: parliamentParam } = await searchParams;
  const parliamentId = parliamentParam === "fed_sen" ? "fed_sen" : "fed_hor";

  const supabase = createClient();

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, subject, result, ayes_count, noes_count, division_number, sitting_days(sitting_date, parliament_id)")
    .eq("sitting_days.parliament_id", parliamentId)
    .order("sitting_day_id", { ascending: false })
    .order("division_number")
    .limit(200);

  const filtered = (divisions ?? []).filter(
    (d) => (d.sitting_days as { parliament_id: string } | null)?.parliament_id === parliamentId
  );

  // Group by date
  const grouped = new Map<string, typeof filtered>();
  for (const div of filtered) {
    const date = (div.sitting_days as { sitting_date: string } | null)?.sitting_date ?? "unknown";
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(div);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Divisions</h1>
        <div className="flex gap-2">
          <Link
            href="/divisions"
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              parliamentId === "fed_hor"
                ? "bg-[#006945] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            House
          </Link>
          <Link
            href="/divisions?parliament=fed_sen"
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              parliamentId === "fed_sen"
                ? "bg-[#C1121F] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Senate
          </Link>
        </div>
      </div>

      {grouped.size === 0 && (
        <p className="text-gray-500 text-sm">No divisions found.</p>
      )}

      {Array.from(grouped.entries()).map(([date, divs]) => (
        <section key={date}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {date !== "unknown" ? format(parseISO(date), "EEEE d MMMM yyyy") : "Unknown date"}
          </h2>
          <div className="space-y-2">
            {divs.map((div) => (
              <Link
                key={div.id}
                href={`/divisions/${div.id}`}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900 mr-4">{div.subject}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-gray-500">
                    <span className="text-green-600 font-medium">{div.ayes_count}</span>
                    {" – "}
                    <span className="text-red-600 font-medium">{div.noes_count}</span>
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    div.result === "passed" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                  }`}>
                    {div.result === "passed" ? "PASSED" : "DEFEATED"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
