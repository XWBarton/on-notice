import { createClient } from "@/lib/supabase";
import { format } from "date-fns";

export const revalidate = 3600;

export default async function PodcastPage() {
  const supabase = createClient();

  const { data: episodes } = await supabase
    .from("episodes")
    .select("*, sitting_days(sitting_date)")
    .not("audio_url", "is", null)
    .order("published_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Question Time Podcast</h1>
        <a
          href="/api/feed.xml"
          className="text-sm text-blue-600 hover:underline"
        >
          RSS Feed
        </a>
      </div>
      <p className="text-gray-500 text-sm">
        Daily question time — Dorothy Dixers removed. Just the real scrutiny.
      </p>

      {!episodes?.length && (
        <p className="text-gray-400 text-sm">No episodes yet.</p>
      )}

      <div className="space-y-3">
        {episodes?.map((ep) => (
          <a
            key={ep.id}
            href={`/podcast/${ep.id}`}
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-gray-900">{ep.title}</p>
                {ep.sitting_days?.sitting_date && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {format(new Date(ep.sitting_days.sitting_date), "EEEE d MMMM yyyy")}
                  </p>
                )}
                {ep.question_count != null && (
                  <p className="text-xs text-gray-400 mt-1">
                    {ep.question_count} questions
                    {ep.dorothy_dixer_count != null && ep.dorothy_dixer_count > 0
                      ? ` · ${ep.dorothy_dixer_count} Dorothy Dixers removed`
                      : ""}
                  </p>
                )}
              </div>
              {ep.duration_sec && (
                <span className="text-sm text-gray-400 shrink-0">
                  {formatDuration(ep.duration_sec)}
                </span>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
