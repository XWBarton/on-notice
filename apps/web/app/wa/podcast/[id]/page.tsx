import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { PodcastPlayer, type Chapter } from "@/components/Podcast/PodcastPlayer";

export default async function WAEpisodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chamber?: string }>;
}) {
  const { id: date } = await params;
  const { chamber } = await searchParams;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const parliamentId = chamber === "lc" ? "wa_lc" : "wa_la";
  const chamberLabel = parliamentId === "wa_la" ? "Legislative Assembly" : "Legislative Council";

  const supabase = createClient();

  const { data: day } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, audio_url, audio_duration_sec, daily_digests(lede, ai_summary)")
    .eq("sitting_date", date)
    .eq("parliament_id", parliamentId)
    .maybeSingle();

  if (!day) notFound();

  // Podcasting 2.0 chapters, if the pipeline has published them
  let chapters: Chapter[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audioUrl: string | null = (day as any).audio_url ?? null;
  if (audioUrl) {
    const chaptersUrl = audioUrl.replace(/\/episode\.mp3$/, "/chapters.json");
    try {
      const res = await fetch(chaptersUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const json = await res.json();
        chapters = json.chapters ?? [];
      }
    } catch {
      // No chapters available — continue without
    }
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*, asker:members!questions_asker_id_fkey(name_display, parties(short_name, colour_hex)), minister:members!questions_minister_id_fkey(name_display, parties(short_name, colour_hex))")
    .eq("sitting_day_id", day.id)
    .order("question_number");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realQuestions = (questions ?? []).filter((q: any) => !q.is_dorothy_dixer);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dixerCount = (questions ?? []).filter((q: any) => q.is_dorothy_dixer).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const digest = Array.isArray((day as any).daily_digests) ? (day as any).daily_digests[0] : (day as any).daily_digests;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500 mb-1">
          <a href="/podcast" className="hover:underline">← All episodes</a>
        </p>
        <h1 className="text-xl font-bold">
          {format(new Date(day.sitting_date), "EEEE d MMMM yyyy")}: {chamberLabel} Question Time
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          {realQuestions.length} questions
          {dixerCount > 0 ? ` · ${dixerCount} Dorothy Dixers removed` : ""}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(day as any).audio_duration_sec ? ` · ${formatDuration((day as any).audio_duration_sec)}` : ""}
        </p>
      </div>

      {audioUrl ? (
        <PodcastPlayer audioUrl={audioUrl} chapters={chapters} parliamentId={parliamentId} />
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
          Audio processing in progress. Check back soon.
        </div>
      )}

      {digest?.ai_summary && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Summary</p>
          <p className="text-sm text-gray-700 leading-relaxed">{digest.ai_summary}</p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Questions</h2>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {realQuestions.map((q: any) => (
          <div key={q.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {q.asker && (
                <>
                  <span className="font-medium">{q.asker.name_display}</span>
                  {q.asker.parties && (
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${q.asker.parties.colour_hex}20`, color: q.asker.parties.colour_hex }}
                    >
                      {q.asker.parties.short_name}
                    </span>
                  )}
                  <span className="text-gray-400">→</span>
                </>
              )}
              {q.minister && (
                <span className="text-gray-700">{q.minister.name_display}</span>
              )}
            </div>
            {q.minister && q.minister_name && (
              <p className="text-xs text-gray-400 mt-0.5">Asked of {q.minister_name}</p>
            )}
            {q.subject && (
              <p className="text-sm font-medium text-gray-900 mt-1">{q.subject}</p>
            )}
            {q.ai_summary && (
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{q.ai_summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
