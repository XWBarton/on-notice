import { createClient } from "@/lib/supabase";
import { format, parseISO } from "date-fns";
import { WAQuestionCard } from "./components/WAQuestionCard";
import { SessionPlayer } from "./components/SessionPlayer";

export const revalidate = 1800;

type Chamber = "wa_la" | "wa_lc";

interface PageProps {
  searchParams: Promise<{ chamber?: string }>;
}

export default async function WAHomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const chamber: Chamber = params.chamber === "lc" ? "wa_lc" : "wa_la";
  const chamberLabel = chamber === "wa_la" ? "Legislative Assembly" : "Legislative Council";

  const supabase = createClient();

  const { data: sittingDayRaw } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, audio_url, audio_duration_sec")
    .eq("parliament_id", chamber)
    .eq("pipeline_status", "complete")
    .order("sitting_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sittingDay = sittingDayRaw as {
    id: string;
    sitting_date: string;
    audio_url: string | null;
    audio_duration_sec: number | null;
  } | null;

  if (!sittingDay) {
    return (
      <div>
        <ChamberToggle active={chamber} />
        <div className="text-center py-24 text-gray-500">
          <p className="text-lg font-medium">No recent sitting days found.</p>
          <p className="text-sm mt-2">Check back when parliament is sitting.</p>
        </div>
      </div>
    );
  }

  type WAQuestion = {
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    members: { name_display: string; party_id: string | null; parties: { short_name: string; colour_hex: string } | null } | null;
  };

  const { data: questionsRaw } = await supabase
    .from("questions")
    .select(`
      question_number,
      subject,
      question_text,
      answer_text,
      ai_summary,
      minister_name,
      members!questions_asker_id_fkey(name_display, party_id, parties(short_name, colour_hex))
    `)
    .eq("sitting_day_id", sittingDay.id)
    .order("question_number", { ascending: true });
  const questions = questionsRaw as WAQuestion[] | null;

  const dateLabel = format(parseISO(sittingDay.sitting_date), "EEEE d MMMM yyyy");

  return (
    <div>
      <ChamberToggle active={chamber} />
      <div className="mb-6">
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

      <div className="space-y-3">
        {questions?.map((q) => (
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
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ChamberToggle({ active }: { active: Chamber }) {
  return (
    <div className="flex gap-2 mb-6">
      <a
        href="/"
        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
          active === "wa_la"
            ? "bg-gray-900 text-white border-gray-900"
            : "text-gray-600 border-gray-300 hover:border-gray-500"
        }`}
      >
        Legislative Assembly
      </a>
      <a
        href="/?chamber=lc"
        className={`text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
          active === "wa_lc"
            ? "bg-gray-900 text-white border-gray-900"
            : "text-gray-600 border-gray-300 hover:border-gray-500"
        }`}
      >
        Legislative Council
      </a>
    </div>
  );
}
