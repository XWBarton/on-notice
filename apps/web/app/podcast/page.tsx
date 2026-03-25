import { createClient } from "@/lib/supabase";
import { format } from "date-fns";
import { CopyRssButton } from "./CopyRssButton";

export const revalidate = 60;

const FEEDS = [
  {
    id: "fed_hor",
    label: "House of Representatives",
    rssUrl: "https://on-notice.xyz/api/feed.xml?parliament=fed_hor",
  },
  {
    id: "fed_sen",
    label: "Senate",
    rssUrl: "https://on-notice.xyz/api/feed.xml?parliament=fed_sen",
  },
];


export default async function PodcastPage() {
  const supabase = createClient();

  const { data: days } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, parliament_id, audio_url, audio_duration_sec, daily_digests(lede), questions(is_dorothy_dixer)")
    .not("audio_url", "is", null)
    .in("parliament_id", ["fed_hor", "fed_sen"])
    .order("sitting_date", { ascending: false })
    .limit(60);

  // Group by date then parliament
  const byDate = new Map<string, { fed_hor?: any; fed_sen?: any }>();
  for (const day of days ?? []) {
    const entry = byDate.get(day.sitting_date) ?? {};
    entry[day.parliament_id as "fed_hor" | "fed_sen"] = day;
    byDate.set(day.sitting_date, entry);
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Question Time Podcast</h1>
        <p className="text-gray-500 text-sm">
          Daily question time — Dorothy Dixers removed. Just the real scrutiny.
        </p>
      </div>

      {/* Subscribe section */}
      <div className="grid sm:grid-cols-2 gap-4">
        {FEEDS.map((feed) => (
          <div key={feed.id} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Feed</p>
              <p className="font-medium text-gray-900">{feed.label}</p>
            </div>
            <CopyRssButton url={feed.rssUrl} />
          </div>
        ))}
      </div>

      {/* Episode list */}
      {!sortedDates.length && (
        <p className="text-gray-400 text-sm">No episodes yet.</p>
      )}

      <div className="space-y-3">
        {sortedDates.map((date) => {
          const entry = byDate.get(date)!;
          return (
            <div key={date} className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="font-medium text-gray-900 mb-2">
                {format(new Date(date), "EEEE d MMMM yyyy")}
              </p>
              <div className="space-y-2">
                {(["fed_hor", "fed_sen"] as const).map((pid) => {
                  const day = entry[pid];
                  if (!day) return null;
                  const questions = day.questions ?? [];
                  const realCount = questions.filter((q: any) => !q.is_dorothy_dixer).length;
                  const dixerCount = questions.filter((q: any) => q.is_dorothy_dixer).length;
                  const digest = Array.isArray(day.daily_digests) ? day.daily_digests[0] : day.daily_digests;
                  return (
                    <a
                      key={pid}
                      href={`/podcast/${date}?parliament=${pid}`}
                      className="flex justify-between items-center gap-4 rounded-md px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700">
                          {pid === "fed_hor" ? "House of Representatives" : "Senate"}
                        </p>
                        {digest?.lede && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{digest.lede}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {realCount} questions
                          {dixerCount > 0 ? ` · ${dixerCount} Dorothy Dixers removed` : ""}
                        </p>
                      </div>
                      {day.audio_duration_sec && (
                        <span className="text-xs text-gray-400 shrink-0">
                          {formatDuration(day.audio_duration_sec)}
                        </span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
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
