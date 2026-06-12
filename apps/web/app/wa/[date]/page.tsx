import { createClient } from "@/lib/supabase";
import { format, parseISO, differenceInDays } from "date-fns";
import { notFound, redirect } from "next/navigation";
import { WAQuestionCard } from "../components/WAQuestionCard";
import { SessionPlayer } from "../components/SessionPlayer";
import { WAFeedNav } from "../components/WAFeedNav";
import { WADigestCard } from "../components/WADigestCard";

export const revalidate = 1800;

type Chamber = "wa_la" | "wa_lc";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ chamber?: string }>;
}

export default async function WADatePage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const { chamber: chamberParam } = await searchParams;
  const chamber: Chamber = chamberParam === "lc" ? "wa_lc" : "wa_la";
  const chamberLabel = chamber === "wa_la" ? "Legislative Assembly" : "Legislative Council";
  const chamberQuery = chamber === "wa_lc" ? "?chamber=lc" : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = createClient();

  const [{ data: sittingDayRaw }, { data: allDates }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("id, sitting_date, audio_url, audio_duration_sec, hansard_url")
      .eq("parliament_id", chamber)
      .eq("sitting_date", date)
      .eq("pipeline_status", "complete")
      .maybeSingle(),
    supabase
      .from("sitting_days")
      .select("sitting_date")
      .eq("parliament_id", chamber)
      .eq("pipeline_status", "complete")
      .order("sitting_date", { ascending: false })
      .limit(60),
  ]);

  const sittingDay = sittingDayRaw as {
    id: string;
    sitting_date: string;
    audio_url: string | null;
    audio_duration_sec: number | null;
    hansard_url: string | null;
  } | null;

  // No data for this exact date — redirect to the most recent sitting day, or 404.
  if (!sittingDay) {
    const latestDate = allDates?.[0]?.sitting_date as string | undefined;
    if (latestDate && latestDate !== date) {
      redirect(`/${latestDate}${chamberQuery}`);
    }
    notFound();
  }

  type WAQuestion = {
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    members: { name_display: string; party_id: string | null; parties: { short_name: string; colour_hex: string } | null } | null;
    minister: { name_display: string; parties: { short_name: string; colour_hex: string } | null } | null;
  };

  const [{ data: questionsRaw }, { data: digestRaw }] = await Promise.all([
    supabase
      .from("questions")
      .select(`
        question_number,
        subject,
        question_text,
        answer_text,
        ai_summary,
        minister_name,
        members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex)),
        minister:members!questions_minister_id_fkey(name_display, parties(short_name, colour_hex))
      `)
      .eq("sitting_day_id", sittingDay.id)
      .order("question_number", { ascending: true }),
    supabase
      .from("daily_digests")
      .select("lede, ai_summary")
      .eq("sitting_day_id", sittingDay.id)
      .maybeSingle(),
  ]);

  const questions = questionsRaw as WAQuestion[] | null;
  const digest = digestRaw as { lede: string | null; ai_summary: string | null } | null;

  const availableDates = (allDates ?? []).map((d) => d.sitting_date as string);
  const dateLabel = format(parseISO(sittingDay.sitting_date), "EEEE d MMMM yyyy");
  const inRecess = differenceInDays(new Date(), parseISO(date)) > 1;

  return (
    <div>
      {inRecess && (
        <div className="mb-6 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Parliament is not currently sitting. Showing the most recent sitting day.
        </div>
      )}

      <WAFeedNav currentDate={date} currentChamber={chamber} availableDates={availableDates} />

      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-1">{dateLabel}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Questions Without Notice
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-3">
            {chamberLabel} · {questions?.length ?? 0} questions
          </p>
          {sittingDay.audio_url && (
            <SessionPlayer url={sittingDay.audio_url} durationSec={sittingDay.audio_duration_sec} />
          )}
        </div>

        {digest && <WADigestCard digest={digest} />}

        {questions && questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((q) => (
              <WAQuestionCard
                key={q.question_number}
                question={{
                  question_number: q.question_number,
                  subject: q.subject,
                  question_text: q.question_text,
                  answer_text: q.answer_text,
                  ai_summary: q.ai_summary,
                  minister_name: q.minister_name,
                  asker: q.members,
                  minister: q.minister,
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            No Questions Without Notice found for this sitting day. It may still be processing.
          </p>
        )}
      </div>
    </div>
  );
}
