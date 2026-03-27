import { createClient } from "@/lib/supabase";
import { CalendarView, type HouseInfo } from "@/components/Calendar/CalendarView";

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

  type SittingDayRow = { id: number; sitting_date: string; parliament_id: string; pipeline_status: string; audio_url: string | null };
  type AudioClipRow = { sitting_day_id: number };

  const [{ data: sittingDays }, { data: audioClipRows }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("id, sitting_date, parliament_id, pipeline_status, audio_url") as unknown as Promise<{ data: SittingDayRow[] | null }>,
    supabase
      .from("questions")
      .select("sitting_day_id")
      .not("audio_clip_url", "is", null)
      .limit(5000) as unknown as Promise<{ data: AudioClipRow[] | null }>,
  ]);

  const sittingDaysWithAudioClips = new Set(
    audioClipRows?.map((r) => r.sitting_day_id) ?? []
  );

  // Build lookup: date → { parliamentId → HouseInfo }
  const dataMap: Record<string, Record<string, HouseInfo>> = {};
  for (const day of sittingDays ?? []) {
    if (!dataMap[day.sitting_date]) dataMap[day.sitting_date] = {};
    dataMap[day.sitting_date][day.parliament_id] = {
      confirmed: true,
      textComplete: day.pipeline_status === "complete",
      hasAudioClips: sittingDaysWithAudioClips.has(day.id),
      hasPodcast: !!day.audio_url,
    };
  }

  return (
    <CalendarView
      dataMap={dataMap}
      scheduledDates={SCHEDULED_SITTING_DATES}
    />
  );
}
