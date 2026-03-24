import { createClient } from "@/lib/supabase";
import { format } from "date-fns";

export const revalidate = 3600;

export default async function PodcastPage() {
  const supabase = createClient();

  const { data: days } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, audio_url, audio_duration_sec, daily_digests(lede), questions(is_dorothy_dixer)")
    .not("audio_url", "is", null)
    .eq("parliament_id", "fed_hor")
    .order("sitting_date", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Question Time Podcast</h1>
        <a href="/api/feed.xml" className="text-sm text-blue-600 hover:underline">
          RSS Feed
        </a>
      </div>
      <p className="text-gray-500 text-sm">
        Daily question time — Dorothy Dixers removed. Just the real scrutiny.
      </p>

      {!days?.length && (
        <p className="text-gray-400 text-sm">No episodes yet.</p>
      )}

      <div className="space-y-3">
        {days?.map((day: any) => {
          const questions = day.questions ?? [];
          const realCount = questions.filter((q: any) => !q.is_dorothy_dixer).length;
          const dixerCount = questions.filter((q: any) => q.is_dorothy_dixer).length;
          const digest = Array.isArray(day.daily_digests) ? day.daily_digests[0] : day.daily_digests;

          return (
            <a
              key={day.id}
              href={`/podcast/${day.sitting_date}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {format(new Date(day.sitting_date), "EEEE d MMMM yyyy")}
                  </p>
                  {digest?.lede && (
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{digest.lede}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {realCount} questions
                    {dixerCount > 0 ? ` · ${dixerCount} Dorothy Dixers removed` : ""}
                  </p>
                </div>
                {day.audio_duration_sec && (
                  <span className="text-sm text-gray-400 shrink-0">
                    {formatDuration(day.audio_duration_sec)}
                  </span>
                )}
              </div>
            </a>
          );
        })}
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
