import { createClient } from "@/lib/supabase";
import { WACalendarView, type HouseInfo } from "../components/WACalendarView";

export const revalidate = 3600;

// Scheduled 2026 WA parliamentary sitting dates, per chamber.
// Source: Parliament of Western Australia — Calendar for 2026 (official PDF).
// Colour key on that calendar: both houses, Assembly only (incl. Assembly
// Estimates), Council only (incl. Council Estimates).
export const SCHEDULED_SITTING_DATES: Record<string, ("wa_la" | "wa_lc")[]> = {
  // February — autumn sittings commence
  "2026-02-17": ["wa_la", "wa_lc"],
  "2026-02-18": ["wa_la", "wa_lc"],
  "2026-02-19": ["wa_la", "wa_lc"],
  "2026-02-24": ["wa_la", "wa_lc"],
  "2026-02-25": ["wa_la", "wa_lc"],
  "2026-02-26": ["wa_la", "wa_lc"],
  // March
  "2026-03-10": ["wa_la", "wa_lc"],
  "2026-03-11": ["wa_la", "wa_lc"],
  "2026-03-12": ["wa_la", "wa_lc"],
  "2026-03-17": ["wa_la", "wa_lc"],
  "2026-03-18": ["wa_la", "wa_lc"],
  "2026-03-19": ["wa_la", "wa_lc"],
  // April
  "2026-04-14": ["wa_la", "wa_lc"],
  // May — 19–21 is Assembly Estimates (Assembly only)
  "2026-05-05": ["wa_la", "wa_lc"],
  "2026-05-06": ["wa_la", "wa_lc"],
  "2026-05-07": ["wa_la", "wa_lc"],
  "2026-05-12": ["wa_la", "wa_lc"],
  "2026-05-13": ["wa_la", "wa_lc"],
  "2026-05-14": ["wa_la", "wa_lc"],
  "2026-05-19": ["wa_la"],
  "2026-05-20": ["wa_la"],
  "2026-05-21": ["wa_la"],
  // June — autumn concludes 18 June; 22–25 is Council Estimates (Council only)
  "2026-06-09": ["wa_la", "wa_lc"],
  "2026-06-10": ["wa_la", "wa_lc"],
  "2026-06-11": ["wa_la", "wa_lc"],
  "2026-06-16": ["wa_la", "wa_lc"],
  "2026-06-17": ["wa_la", "wa_lc"],
  "2026-06-18": ["wa_la", "wa_lc"],
  "2026-06-22": ["wa_lc"],
  "2026-06-23": ["wa_lc"],
  "2026-06-24": ["wa_lc"],
  "2026-06-25": ["wa_lc"],
  // August — spring sittings commence
  "2026-08-11": ["wa_la", "wa_lc"],
  "2026-08-12": ["wa_la", "wa_lc"],
  "2026-08-13": ["wa_la", "wa_lc"],
  "2026-08-18": ["wa_la", "wa_lc"],
  "2026-08-19": ["wa_la", "wa_lc"],
  "2026-08-20": ["wa_la", "wa_lc"],
  // September
  "2026-09-08": ["wa_la", "wa_lc"],
  "2026-09-09": ["wa_la", "wa_lc"],
  "2026-09-10": ["wa_la", "wa_lc"],
  "2026-09-15": ["wa_la", "wa_lc"],
  "2026-09-16": ["wa_la", "wa_lc"],
  "2026-09-17": ["wa_la", "wa_lc"],
  // October
  "2026-10-13": ["wa_la", "wa_lc"],
  "2026-10-14": ["wa_la", "wa_lc"],
  "2026-10-15": ["wa_la", "wa_lc"],
  "2026-10-20": ["wa_la", "wa_lc"],
  "2026-10-21": ["wa_la", "wa_lc"],
  "2026-10-22": ["wa_la", "wa_lc"],
  // November — Assembly's last sitting day is 19 Nov; 24–26 is Council only
  "2026-11-10": ["wa_la", "wa_lc"],
  "2026-11-11": ["wa_la", "wa_lc"],
  "2026-11-12": ["wa_la", "wa_lc"],
  "2026-11-17": ["wa_la", "wa_lc"],
  "2026-11-18": ["wa_la", "wa_lc"],
  "2026-11-19": ["wa_la", "wa_lc"],
  "2026-11-24": ["wa_lc"],
  "2026-11-25": ["wa_lc"],
  "2026-11-26": ["wa_lc"],
};

export default async function WACalendarPage() {
  const supabase = createClient();

  type SittingDayRow = { id: number; sitting_date: string; parliament_id: string; pipeline_status: string; audio_url: string | null };
  type AudioClipRow = { sitting_day_id: number };

  const [{ data: sittingDays }, { data: audioClipRows }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("id, sitting_date, parliament_id, pipeline_status, audio_url")
      .in("parliament_id", ["wa_la", "wa_lc"]) as unknown as Promise<{ data: SittingDayRow[] | null }>,
    supabase
      .from("questions")
      .select("sitting_day_id")
      .not("audio_clip_url", "is", null)
      .limit(5000) as unknown as Promise<{ data: AudioClipRow[] | null }>,
  ]);

  const sittingDaysWithAudioClips = new Set(
    audioClipRows?.map((r) => r.sitting_day_id) ?? []
  );

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
    <WACalendarView
      dataMap={dataMap}
      scheduledDates={SCHEDULED_SITTING_DATES}
    />
  );
}
