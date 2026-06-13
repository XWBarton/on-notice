import { createClient } from "@/lib/supabase";
import { format, parseISO, differenceInDays } from "date-fns";
import { notFound, redirect } from "next/navigation";
import { WADayView, type ChamberData } from "../components/WADayView";

export const revalidate = 1800;

type Chamber = "wa_la" | "wa_lc";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ chamber?: string }>;
}

export default async function WADatePage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const { chamber: chamberParam } = await searchParams;
  const initialChamber: Chamber = chamberParam === "lc" ? "wa_lc" : "wa_la";
  const chamberQuery = chamberParam === "lc" ? "?chamber=lc" : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = createClient();

  // Both chambers load together so the toggle switches instantly client-side.
  const [{ data: daysRaw }, { data: allDatesRaw }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("id, sitting_date, parliament_id, audio_url, audio_duration_sec, hansard_url")
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

  type SittingDay = {
    id: string;
    sitting_date: string;
    parliament_id: Chamber;
    audio_url: string | null;
    audio_duration_sec: number | null;
    hansard_url: string | null;
  };
  const days = (daysRaw ?? []) as SittingDay[];

  // No data for this exact date in either chamber — redirect to the most
  // recent sitting day, or 404.
  if (days.length === 0) {
    const latestDate = allDatesRaw?.[0]?.sitting_date as string | undefined;
    if (latestDate && latestDate !== date) {
      redirect(`/${latestDate}${chamberQuery}`);
    }
    notFound();
  }

  type WAQuestionRow = {
    sitting_day_id: string;
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    audio_clip_url: string | null;
    is_dorothy_dixer: boolean | null;
    members: { name_display: string; party_id: string | null; parties: { short_name: string; colour_hex: string } | null } | null;
    minister: { name_display: string; parties: { short_name: string; colour_hex: string } | null } | null;
  };

  const dayIds = days.map((d) => d.id);
  const [{ data: questionsRaw }, { data: digestsRaw }] = await Promise.all([
    supabase
      .from("questions")
      .select(`
        sitting_day_id,
        question_number,
        subject,
        question_text,
        answer_text,
        ai_summary,
        minister_name,
        audio_clip_url,
        is_dorothy_dixer,
        members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex)),
        minister:members!questions_minister_id_fkey(name_display, parties(short_name, colour_hex))
      `)
      .in("sitting_day_id", dayIds)
      .order("question_number", { ascending: true }),
    supabase
      .from("daily_digests")
      .select("sitting_day_id, lede, ai_summary")
      .in("sitting_day_id", dayIds),
  ]);

  const questions = (questionsRaw ?? []) as WAQuestionRow[];
  const digests = (digestsRaw ?? []) as { sitting_day_id: string; lede: string | null; ai_summary: string | null }[];

  const chamberData = (chamber: Chamber): ChamberData => {
    const day = days.find((d) => d.parliament_id === chamber) ?? null;
    return {
      sittingDay: day
        ? { id: day.id, audio_url: day.audio_url, audio_duration_sec: day.audio_duration_sec }
        : null,
      questions: questions
        .filter((q) => q.sitting_day_id === day?.id)
        .map((q) => ({
          question_number: q.question_number,
          subject: q.subject,
          question_text: q.question_text,
          answer_text: q.answer_text,
          ai_summary: q.ai_summary,
          minister_name: q.minister_name,
          audio_clip_url: q.audio_clip_url,
          is_dorothy_dixer: q.is_dorothy_dixer ?? false,
          asker: q.members,
          minister: q.minister,
        })),
      digest: digests.find((dg) => dg.sitting_day_id === day?.id) ?? null,
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

      <WADayView
        date={date}
        dateLabel={dateLabel}
        initialChamber={initialChamber}
        chambers={{ wa_la: chamberData("wa_la"), wa_lc: chamberData("wa_lc") }}
        availableDates={availableDates}
      />
    </div>
  );
}
