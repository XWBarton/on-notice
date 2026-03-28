import { createClient } from "@/lib/supabase";
import { format, parseISO } from "date-fns";

export const revalidate = 1800;

export default async function WAHomePage() {
  const supabase = createClient();

  const { data: sittingDay } = await supabase
    .from("sitting_days")
    .select("id, sitting_date")
    .eq("parliament_id", "wa_la")
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

  const { data: questions } = await supabase
    .from("questions")
    .select("question_number, subject, question_text, members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex))")
    .eq("sitting_day_id", sittingDay.id)
    .order("question_number", { ascending: true });

  const dateLabel = format(parseISO(sittingDay.sitting_date), "EEEE d MMMM yyyy");

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Questions Without Notice
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Legislative Assembly · {questions?.length ?? 0} questions
        </p>
      </div>

      <div className="space-y-3">
        {questions?.map((q) => {
          const member = q.members as { name_display: string; party_id: string; parties: { short_name: string; colour_hex: string } | null } | null;
          const party = member?.parties;
          return (
            <div key={q.question_number} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-400">
                    Q{q.question_number}
                  </span>
                  {party && (
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${party.colour_hex}20`, color: party.colour_hex }}
                    >
                      {party.short_name}
                    </span>
                  )}
                  <span className="font-semibold text-gray-900">
                    {member?.name_display ?? "Unknown"}
                  </span>
                </div>
                {q.subject && (
                  <span className="text-xs text-gray-400 shrink-0 text-right">
                    {q.subject}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                {q.question_text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
