import { createClient } from "@/lib/supabase";
import { format, parseISO, isFuture, differenceInDays } from "date-fns";
import { notFound } from "next/navigation";
import { BillCard } from "@/components/DailyFeed/BillCard";
import { DivisionCard } from "@/components/DailyFeed/DivisionCard";
import { DigestCard } from "@/components/DailyFeed/DigestCard";
import { FeedNav } from "@/components/DailyFeed/FeedNav";
import { QuestionSection } from "@/components/DailyFeed/QuestionSection";
import { SCHEDULED_SITTING_DATES } from "@/app/calendar/page";

export const revalidate = 60;

export default async function DatePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ parliament?: string }>;
}) {
  const { date } = await params;
  const { parliament: parliamentParam } = await searchParams;
  const parliamentId = parliamentParam === "fed_sen" ? "fed_sen" : "fed_hor";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = createClient();

  const [{ data: sittingDay }, { data: allDates }] = await Promise.all([
    supabase
      .from("sitting_days")
      .select("*")
      .eq("sitting_date", date)
      .eq("parliament_id", parliamentId)
      .maybeSingle(),
    supabase
      .from("sitting_days")
      .select("sitting_date")
      .eq("parliament_id", parliamentId)
      .eq("pipeline_status", "complete")
      .order("sitting_date", { ascending: false })
      .limit(60),
  ]);

  if (!sittingDay) {
    const isScheduled = !!(SCHEDULED_SITTING_DATES[date]);
    const dateObj = parseISO(date);
    if (isScheduled) {
      return (
        <div className="text-center py-24 space-y-3">
          <p className="text-xl font-semibold text-gray-800">
            {format(dateObj, "EEEE d MMMM yyyy")}
          </p>
          <p className="text-gray-500">
            {isFuture(dateObj)
              ? "Parliament is scheduled to sit on this day. Check back after the sitting."
              : "Data for this sitting day is still being processed. Check back soon."}
          </p>
          <a href="/calendar" className="text-sm text-blue-600 hover:underline">← Back to calendar</a>
        </div>
      );
    }
    notFound();
  }

  const [{ data: digest }, { data: bills }, { data: divisions }, { data: questions }] =
    await Promise.all([
      supabase.from("daily_digests").select("*").eq("sitting_day_id", sittingDay.id).maybeSingle(),
      supabase
        .from("bills")
        .select("*, members(name_display, party_id, parties(name, short_name, colour_hex))")
        .eq("sitting_day_id", sittingDay.id),
      supabase.from("divisions").select("*").eq("sitting_day_id", sittingDay.id).order("occurred_at").order("division_number"),
      supabase
        .from("questions")
        .select("*, audio_clip_url, asker:members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex)), minister:members!questions_minister_id_fkey(name_display, role)")
        .eq("sitting_day_id", sittingDay.id)
        .order("question_number")
        .limit(80),
    ]);

  const availableDates = (allDates ?? []).map((d) => d.sitting_date as string);
  const daysSinceSitting = differenceInDays(new Date(), parseISO(date));
  const inRecess = daysSinceSitting > 1;

  return (
    <div>
      {inRecess && (
        <div className="mb-6 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          Parliament is not currently sitting. Showing the most recent sitting day.{" "}
          <a href="/calendar" className="text-blue-600 hover:underline">View sitting calendar →</a>
        </div>
      )}
      <FeedNav
        currentDate={date}
        currentParliament={parliamentId}
        availableDates={availableDates}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {format(parseISO(date), "EEEE d MMMM yyyy")}
          </h1>
          <span className="text-sm text-gray-500">
            {parliamentId === "fed_hor" ? "House of Representatives" : "Senate"}
          </span>
        </div>

        {digest && <DigestCard digest={digest} />}

        {questions && questions.length > 0 ? (
          <QuestionSection questions={questions} />
        ) : questions !== null && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Question Time</h2>
            <p className="text-sm text-gray-400">
              No question time data found on OpenAustralia for this day — it may still be processing.
            </p>
          </section>
        )}

        {divisions && divisions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Divisions</h2>
            <div className="space-y-3">
              {divisions.map((division) => <DivisionCard key={division.id} division={division} />)}
            </div>
          </section>
        )}

        {bills && bills.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Bills</h2>
            <div className="space-y-3">
              {bills.map((bill) => <BillCard key={bill.id} bill={bill} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
