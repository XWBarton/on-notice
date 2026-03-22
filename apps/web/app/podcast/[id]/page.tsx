import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 86400;

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: episode } = await supabase
    .from("episodes")
    .select("*, sitting_days(sitting_date)")
    .eq("id", id)
    .single();

  if (!episode) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select(
      "*, asker:members!questions_asker_id_fkey(name_display, parties(short_name, colour_hex)), minister:members!questions_minister_id_fkey(name_display, role)"
    )
    .eq("sitting_day_id", episode.sitting_day_id)
    .order("question_number");

  const realQuestions = questions?.filter((q) => !q.is_dorothy_dixer) ?? [];
  const dixerCount = questions?.filter((q) => q.is_dorothy_dixer).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{episode.title}</h1>
        {episode.sitting_days?.sitting_date && (
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(episode.sitting_days.sitting_date), "EEEE d MMMM yyyy")}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {realQuestions.length} questions · {dixerCount} Dorothy Dixers removed
        </p>
      </div>

      {episode.audio_url && (
        <audio
          controls
          className="w-full"
          src={episode.audio_url}
          preload="metadata"
        />
      )}

      {!episode.audio_url && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
          Audio processing in progress — check back soon.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Questions
        </h2>
        {realQuestions.map((q) => (
          <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {q.asker && (
                <>
                  <span className="font-medium">{q.asker.name_display}</span>
                  {q.asker.parties && <PartyBadge party={q.asker.parties} />}
                  <span className="text-gray-400">→</span>
                </>
              )}
              {q.minister && (
                <span className="text-gray-700">
                  {q.minister.name_display}
                  {q.minister.role && (
                    <span className="text-gray-400"> ({q.minister.role})</span>
                  )}
                </span>
              )}
            </div>
            {q.subject && (
              <p className="text-sm font-medium text-gray-900 mt-1">{q.subject}</p>
            )}
            {q.ai_summary && (
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{q.ai_summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
