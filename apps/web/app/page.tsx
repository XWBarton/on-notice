import { createClient } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { BillCard } from "@/components/DailyFeed/BillCard";
import { DivisionCard } from "@/components/DailyFeed/DivisionCard";
import { QuestionCard } from "@/components/DailyFeed/QuestionCard";
import { DigestCard } from "@/components/DailyFeed/DigestCard";

export const revalidate = 3600;

export default async function TodayPage() {
  const supabase = createClient();

  // Show the most recent sitting day that has completed data
  const { data: sittingDay } = await supabase
    .from("sitting_days")
    .select("*")
    .eq("parliament_id", "fed_hor")
    .eq("pipeline_status", "complete")
    .order("sitting_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sittingDay) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p className="text-lg font-medium">Parliament is not sitting today.</p>
        <p className="text-sm mt-2">Check back on the next sitting day.</p>
      </div>
    );
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const isToday = sittingDay.sitting_date === today;

  const [{ data: digest }, { data: bills }, { data: divisions }, { data: questions }] =
    await Promise.all([
      supabase
        .from("daily_digests")
        .select("*")
        .eq("sitting_day_id", sittingDay.id)
        .maybeSingle(),
      supabase
        .from("bills")
        .select("*, members(name_display, party_id, parties(name, short_name, colour_hex))")
        .eq("sitting_day_id", sittingDay.id),
      supabase
        .from("divisions")
        .select("*")
        .eq("sitting_day_id", sittingDay.id)
        .order("occurred_at"),
      supabase
        .from("questions")
        .select("*, asker:members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex)), minister:members!questions_minister_id_fkey(name_display, role)")
        .eq("sitting_day_id", sittingDay.id)
        .eq("is_dorothy_dixer", false)
        .order("question_number"),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {format(parseISO(sittingDay.sitting_date), "EEEE d MMMM yyyy")}
          </h1>
          {!isToday && (
            <p className="text-sm text-gray-500 mt-0.5">Most recent sitting day</p>
          )}
        </div>
        <span className="text-sm text-gray-500">House of Representatives</span>
      </div>

      {digest && <DigestCard digest={digest} />}

      {bills && bills.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Bills
          </h2>
          <div className="space-y-3">
            {bills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        </section>
      )}

      {divisions && divisions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Divisions
          </h2>
          <div className="space-y-3">
            {divisions.map((division) => (
              <DivisionCard key={division.id} division={division} />
            ))}
          </div>
        </section>
      )}

      {questions && questions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Question Time
          </h2>
          <div className="space-y-3">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
