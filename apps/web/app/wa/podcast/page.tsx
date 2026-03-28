import { createClient } from "@/lib/supabase";
import { format, parseISO } from "date-fns";

export const revalidate = 3600;

const WA_RSS_URL = "https://wa.on-notice.xyz/api/feed.xml";

export default async function WAPodcastPage() {
  const supabase = createClient();

  const { data: daysRaw } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, parliament_id, audio_url, audio_duration_sec")
    .not("audio_url", "is", null)
    .in("parliament_id", ["wa_la", "wa_lc"])
    .order("sitting_date", { ascending: false })
    .limit(40);

  type WADay = {
    id: string;
    sitting_date: string;
    parliament_id: string;
    audio_url: string | null;
    audio_duration_sec: number | null;
  };
  const days = (daysRaw ?? []) as WADay[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Question Time Podcast</h1>
        <p className="text-gray-500 text-sm">
          Questions Without Notice from the WA Legislative Assembly and Council.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">RSS Feed</p>
          <p className="font-medium text-gray-900 text-sm">On Notice WA — Questions Without Notice</p>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{WA_RSS_URL}</p>
        </div>
        <a
          href={WA_RSS_URL}
          className="shrink-0 text-sm font-medium text-blue-600 hover:underline"
        >
          Subscribe →
        </a>
      </div>

      {days.length === 0 && (
        <p className="text-gray-400 text-sm">No episodes yet.</p>
      )}

      <div className="space-y-3">
        {days.map((day) => (
          <a
            key={day.id}
            href={day.audio_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-4 bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-medium text-gray-900 text-sm">
                {format(parseISO(day.sitting_date), "EEEE d MMMM yyyy")}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {day.parliament_id === "wa_la" ? "Legislative Assembly" : "Legislative Council"}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {day.audio_duration_sec && (
                <span className="text-xs text-gray-400">{formatDuration(day.audio_duration_sec)}</span>
              )}
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                ▶ Play
              </span>
            </div>
          </a>
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
