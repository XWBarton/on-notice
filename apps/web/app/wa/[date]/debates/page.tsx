import { createClient } from "@/lib/supabase";
import { format, parseISO, differenceInDays } from "date-fns";
import { notFound, redirect } from "next/navigation";
import { WADebatesView, type DebateChamberData } from "../../components/WADebatesView";
import type { WADebate } from "../../components/WADebateCard";

export const revalidate = 1800;

type Chamber = "wa_la" | "wa_lc";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ chamber?: string }>;
}

export default async function WADebatesPage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const { chamber: chamberParam } = await searchParams;
  const initialChamber: Chamber = chamberParam === "lc" ? "wa_lc" : "wa_la";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = createClient();

  // Both chambers load together so the toggle switches instantly client-side.
  const [{ data: daysRaw }, { data: allDatesRaw }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("id, parliament_id")
      .in("parliament_id", ["wa_la", "wa_lc"])
      .eq("sitting_date", date)
      .eq("pipeline_status", "complete"),
    supabase
      .from("sitting_days")
      .select("sitting_date")
      .in("parliament_id", ["wa_la", "wa_lc"])
      .eq("pipeline_status", "complete")
      .order("sitting_date", { ascending: false })
      .limit(120),
  ]);

  const days = (daysRaw ?? []) as { id: number; parliament_id: Chamber }[];

  if (days.length === 0) {
    const latestDate = allDatesRaw?.[0]?.sitting_date as string | undefined;
    if (latestDate && latestDate !== date) {
      redirect(`/${latestDate}/debates${chamberParam === "lc" ? "?chamber=lc" : ""}`);
    }
    notFound();
  }

  const dayIds = days.map((d) => d.id);
  const { data: debatesRaw } = await supabase
    .from("debates")
    .select("sitting_day_id, hansard_section, proceeding_type, title, ai_summary, transcript_json, audio_clip_url, sequence")
    .in("sitting_day_id", dayIds)
    .order("sequence", { ascending: true });

  type DebateRow = WADebate & { sitting_day_id: number };
  const debates = (debatesRaw ?? []) as DebateRow[];

  const chamberData = (chamber: Chamber): DebateChamberData => {
    const day = days.find((d) => d.parliament_id === chamber) ?? null;
    return {
      debates: debates
        .filter((d) => d.sitting_day_id === day?.id)
        .map(({ sitting_day_id: _omit, ...rest }) => rest),
    };
  };

  const availableDates = [...new Set((allDatesRaw ?? []).map((d) => d.sitting_date as string))];
  const dateLabel = format(parseISO(date), "EEEE d MMMM yyyy");
  const inRecess = differenceInDays(new Date(), parseISO(date)) > 1;

  return (
    <div>
      {inRecess && (
        <div className="mb-6 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Parliament is not currently sitting. Showing the most recent sitting day.
        </div>
      )}

      <WADebatesView
        date={date}
        dateLabel={dateLabel}
        initialChamber={initialChamber}
        chambers={{ wa_la: chamberData("wa_la"), wa_lc: chamberData("wa_lc") }}
        availableDates={availableDates}
      />
    </div>
  );
}
