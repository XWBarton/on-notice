import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { parseISO, formatDistanceToNowStrict } from "date-fns";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 3600;

const STAGE_INFO: Record<string, { label: string; description: string; next: string | null }> = {
  first_reading: {
    label: "First Reading",
    description: "Introduced and tabled. No debate yet.",
    next: "Second Reading",
  },
  second_reading: {
    label: "Second Reading",
    description: "The chamber is debating whether to accept the bill's general principles.",
    next: "Consideration in Detail / Committee",
  },
  second_reading_amendment: {
    label: "Second Reading Amendment",
    description: "An amendment to the second reading motion is being considered.",
    next: "Second Reading vote",
  },
  consideration_in_detail: {
    label: "Consideration in Detail",
    description: "The House is examining the bill clause by clause and may make amendments.",
    next: "Third Reading",
  },
  committee_of_whole: {
    label: "Committee of the Whole",
    description: "The Senate is examining the bill clause by clause and may make amendments.",
    next: "Third Reading",
  },
  third_reading: {
    label: "Third Reading",
    description: "Final vote before the bill moves to the other chamber or receives assent.",
    next: "Other chamber / Royal Assent",
  },
  passed: {
    label: "Passed",
    description: "Both chambers have agreed. Awaiting Royal Assent.",
    next: "Royal Assent",
  },
  royal_assent: {
    label: "Royal Assent",
    description: "Signed by the Governor-General. Now an Act of Parliament.",
    next: null,
  },
  withdrawn: {
    label: "Withdrawn",
    description: "Withdrawn by its sponsor.",
    next: null,
  },
  lapsed: {
    label: "Lapsed",
    description: "Lapsed at the end of a parliamentary term without being passed.",
    next: null,
  },
  defeated: {
    label: "Defeated",
    description: "Voted down. Cannot proceed without being reintroduced.",
    next: null,
  },
};

function stageInfo(stage: string | null) {
  if (!stage) return null;
  return STAGE_INFO[stage] ?? {
    label: stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: null,
    next: null,
  };
}

// Most advanced first, terminal states last
const STAGE_ORDER = [
  "royal_assent",
  "passed",
  "third_reading",
  "committee_of_whole",
  "consideration_in_detail",
  "second_reading_amendment",
  "second_reading",
  "first_reading",
  "defeated",
  "withdrawn",
  "lapsed",
];

// Stages that represent an active bill still moving through parliament
const TERMINAL_STAGES = new Set(["defeated", "withdrawn", "lapsed"]);

export default async function BillsPage() {
  const supabase = createClient();

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, short_title, bill_stage, ai_summary, introduced_date, parliament_id, sitting_days(sitting_date), members(name_display, party_id, parties(name, short_name, colour_hex))"
    )
    .in("parliament_id", ["fed_hor", "fed_sen"])
    .order("sitting_day_id", { ascending: false })
    .limit(200);

  // Group by stage
  const grouped = new Map<string, typeof bills>();
  for (const bill of bills ?? []) {
    const key = bill.bill_stage ?? "unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(bill);
  }

  const sortedStages = [...grouped.keys()].sort((a, b) => {
    const ai = STAGE_ORDER.indexOf(a);
    const bi = STAGE_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const activeStages = sortedStages.filter((s) => !TERMINAL_STAGES.has(s));
  const terminalStages = sortedStages.filter((s) => TERMINAL_STAGES.has(s));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Bills</h1>

        {/* Stage overview nav */}
        {sortedStages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sortedStages.map((stage) => {
              const info = stageInfo(stage === "unknown" ? null : stage);
              const count = grouped.get(stage)?.length ?? 0;
              const isTerminal = TERMINAL_STAGES.has(stage);
              return (
                <a
                  key={stage}
                  href={`#stage-${stage}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:border-gray-400 ${
                    isTerminal
                      ? "bg-gray-50 text-gray-400 border-gray-200"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {info?.label ?? "Unknown"}
                  <span className={`font-semibold ${isTerminal ? "text-gray-400" : "text-gray-900"}`}>
                    {count}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {sortedStages.length === 0 && (
        <p className="text-gray-500 text-sm">No bills found.</p>
      )}

      {/* Active stages */}
      {activeStages.map((stage) => (
        <StageSection key={stage} stage={stage} bills={grouped.get(stage) ?? []} />
      ))}

      {/* Terminal stages in a muted group */}
      {terminalStages.length > 0 && (
        <div className="space-y-8 opacity-60">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">No longer active</p>
          {terminalStages.map((stage) => (
            <StageSection key={stage} stage={stage} bills={grouped.get(stage) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

type BillRow = {
  id: number;
  short_title: string;
  bill_stage: string | null;
  ai_summary: string | null;
  introduced_date: string | null;
  parliament_id: string;
  sitting_days: unknown;
  members: unknown;
};

function StageSection({ stage, bills }: { stage: string; bills: BillRow[] }) {
  const info = stageInfo(stage === "unknown" ? null : stage);

  return (
    <section id={`stage-${stage}`}>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {info?.label ?? "Unknown stage"}
          </h2>
          {info?.description && (
            <p className="text-xs text-gray-500 mt-0.5">{info.description}</p>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0 ml-4">{bills.length} bill{bills.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2">
        {bills.map((bill) => {
          const member = bill.members as {
            name_display: string;
            party_id: string | null;
            parties?: { name: string; short_name: string; colour_hex: string | null } | null;
          } | null;
          const sittingDay = bill.sitting_days as { sitting_date: string } | null;
          const dateForAgo = sittingDay?.sitting_date ?? bill.introduced_date;
          const ago = dateForAgo
            ? formatDistanceToNowStrict(parseISO(dateForAgo), { addSuffix: true })
            : null;
          const chamberLabel = bill.parliament_id === "fed_sen" ? "Senate" : "House";

          return (
            <Link
              key={bill.id}
              href={`/bills/${bill.id}`}
              className="block bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-snug">{bill.short_title}</p>
                  {member && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">Introduced by {member.name_display}</span>
                      {member.parties && <PartyBadge party={member.parties} />}
                    </div>
                  )}
                  {bill.ai_summary && (
                    <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {bill.ai_summary}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    bill.parliament_id === "fed_sen"
                      ? "bg-red-50 text-red-700"
                      : "bg-green-50 text-green-700"
                  }`}>
                    {chamberLabel}
                  </span>
                  {ago && (
                    <span className="text-xs text-gray-400">{ago}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
