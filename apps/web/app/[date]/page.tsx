import { createClient } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { notFound } from "next/navigation";
import { BillCard } from "@/components/DailyFeed/BillCard";
import { DivisionCard } from "@/components/DailyFeed/DivisionCard";
import { QuestionCard } from "@/components/DailyFeed/QuestionCard";
import { DigestCard } from "@/components/DailyFeed/DigestCard";
import { FeedNav } from "@/components/DailyFeed/FeedNav";

export const revalidate = 3600;

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

  if (!sittingDay) notFound();

  const [{ data: digest }, { data: bills }, { data: divisions }, { data: questions }] =
    await Promise.all([
      supabase.from("daily_digests").select("*").eq("sitting_day_id", sittingDay.id).maybeSingle(),
      supabase
        .from("bills")
        .select("*, members(name_display, party_id, parties(name, short_name, colour_hex))")
        .eq("sitting_day_id", sittingDay.id),
      supabase.from("divisions").select("*").eq("sitting_day_id", sittingDay.id).order("division_number"),
      supabase
        .from("questions")
        .select("*, asker:members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex)), minister:members!questions_minister_id_fkey(name_display, role)")
        .eq("sitting_day_id", sittingDay.id)
        .eq("is_dorothy_dixer", false)
        .order("question_number")
        .limit(50),
    ]);

  const availableDates = (allDates ?? []).map((d) => d.sitting_date as string);

  return (
    <div>
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

        {bills && bills.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Bills</h2>
            <div className="space-y-3">
              {bills.map((bill) => <BillCard key={bill.id} bill={bill} />)}
            </div>
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

        {questions && questions.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Question Time <span className="normal-case font-normal">(Dorothy Dixers removed)</span></h2>
            <div className="space-y-3">
              {questions.map((question) => <QuestionCard key={question.id} question={question} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
