import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 86400;

// ─── Pipeline ───────────────────────────────────────────────────────────────

type Step = { label: string; chamber: "house" | "senate" | "assent" };

const HOUSE_FIRST_STEPS: Step[] = [
  { label: "First Reading", chamber: "house" },
  { label: "Second Reading", chamber: "house" },
  { label: "Consideration in Detail", chamber: "house" },
  { label: "Third Reading", chamber: "house" },
  { label: "First Reading", chamber: "senate" },
  { label: "Second Reading", chamber: "senate" },
  { label: "Committee of the Whole", chamber: "senate" },
  { label: "Third Reading", chamber: "senate" },
  { label: "Royal Assent", chamber: "assent" },
];

const SENATE_FIRST_STEPS: Step[] = [
  { label: "First Reading", chamber: "senate" },
  { label: "Second Reading", chamber: "senate" },
  { label: "Committee of the Whole", chamber: "senate" },
  { label: "Third Reading", chamber: "senate" },
  { label: "First Reading", chamber: "house" },
  { label: "Second Reading", chamber: "house" },
  { label: "Consideration in Detail", chamber: "house" },
  { label: "Third Reading", chamber: "house" },
  { label: "Royal Assent", chamber: "assent" },
];

// Map bill_stage → step index (0–8). Returns -1 if unknown.
function getStageIndex(stage: string | null, isHouseFirst: boolean): number {
  if (!stage) return -1;
  const houseFirstMap: Record<string, number> = {
    first_reading: 0,
    second_reading: 1,
    second_reading_amendment: 1,
    consideration_in_detail: 2,
    third_reading: 3,
    committee_of_whole: 6,
    passed: 8,
    royal_assent: 8,
  };
  const senateFirstMap: Record<string, number> = {
    first_reading: 0,
    second_reading: 1,
    second_reading_amendment: 1,
    committee_of_whole: 2,
    third_reading: 3,
    consideration_in_detail: 6,
    passed: 8,
    royal_assent: 8,
  };
  return (isHouseFirst ? houseFirstMap : senateFirstMap)[stage] ?? -1;
}

const TERMINAL_STAGES = new Set(["withdrawn", "lapsed", "defeated"]);

function BillPipeline({
  stage,
  parliamentId,
}: {
  stage: string | null;
  parliamentId: string;
}) {
  const isHouseFirst = parliamentId !== "fed_sen";
  const steps = isHouseFirst ? HOUSE_FIRST_STEPS : SENATE_FIRST_STEPS;
  const currentIndex = getStageIndex(stage, isHouseFirst);

  const isTerminal = stage ? TERMINAL_STAGES.has(stage) : false;

  const chamberSections = [
    { label: isHouseFirst ? "House of Representatives" : "Senate", color: isHouseFirst ? "green" : "red", range: [0, 3] as [number, number] },
    { label: isHouseFirst ? "Senate" : "House of Representatives", color: isHouseFirst ? "red" : "green", range: [4, 7] as [number, number] },
    { label: "Royal Assent", color: "gray", range: [8, 8] as [number, number] },
  ];

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Bill Progress</h2>

      {isTerminal && stage && (
        <div className="mb-3 text-sm px-3 py-2 bg-orange-50 border border-orange-200 rounded text-orange-700 font-medium">
          {stage === "withdrawn" && "Bill withdrawn. Will not proceed further."}
          {stage === "lapsed" && "Bill lapsed. Would need to be reintroduced to continue."}
          {stage === "defeated" && "Bill defeated. Cannot proceed without being reintroduced."}
        </div>
      )}

      <div className="space-y-5">
        {chamberSections.map((section) => {
          const sectionSteps = steps.slice(section.range[0], section.range[1] + 1);
          const colorClass = section.color === "green"
            ? "text-[#006945] border-[#006945]"
            : section.color === "red"
            ? "text-[#C1121F] border-[#C1121F]"
            : "text-gray-500 border-gray-300";
          const bgClass = section.color === "green"
            ? "bg-[#006945]"
            : section.color === "red"
            ? "bg-[#C1121F]"
            : "bg-gray-400";

          return (
            <div key={section.label}>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${section.color === "gray" ? "text-gray-400" : section.color === "green" ? "text-[#006945]" : "text-[#C1121F]"}`}>
                {section.label}
              </p>
              <div className="space-y-0">
                {sectionSteps.map((step, i) => {
                  const globalIndex = section.range[0] + i;
                  const isDone = !isTerminal && currentIndex >= 0 && globalIndex < currentIndex;
                  const isCurrent = !isTerminal && globalIndex === currentIndex;
                  const isPending = isTerminal || currentIndex < 0 || globalIndex > currentIndex;
                  const isLast = i === sectionSteps.length - 1;

                  return (
                    <div key={step.label + globalIndex} className="flex items-stretch gap-3">
                      {/* Dot + connector line */}
                      <div className="flex flex-col items-center" style={{ width: 20 }}>
                        <div className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center mt-0.5 ${
                          isCurrent
                            ? `ring-2 ring-offset-1 ${colorClass} ${bgClass}`
                            : isDone
                            ? bgClass
                            : "bg-white border-2 border-gray-300"
                        }`}>
                          {isDone && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        {!isLast && (
                          <div className={`w-px flex-1 mt-0.5 ${isDone || isCurrent ? bgClass : "bg-gray-200"}`} style={{ minHeight: 16 }} />
                        )}
                      </div>

                      {/* Step label */}
                      <div className="pb-3 flex-1">
                        <p className={`text-sm ${
                          isCurrent
                            ? "font-semibold text-gray-900"
                            : isDone
                            ? "text-gray-500"
                            : "text-gray-400"
                        }`}>
                          {step.label}
                          {isCurrent && (
                            <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                              section.color === "green" ? "bg-green-50 text-[#006945]" : section.color === "red" ? "bg-red-50 text-[#C1121F]" : "bg-gray-100 text-gray-500"
                            }`}>
                              Current
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stage descriptions ──────────────────────────────────────────────────────

const STAGE_INFO: Record<string, { description: string; next: string | null }> = {
  first_reading: {
    description:
      "The bill is introduced to the chamber by its sponsor and given a formal title. No debate takes place. This step exists so all members are officially notified the bill is coming before any substantive discussion begins.",
    next: "Second Reading, where the chamber debates the bill's overall purpose and principles",
  },
  second_reading: {
    description:
      "The main debate on whether the chamber supports the broad purpose of the bill. Members speak to its overall merits and concerns rather than the fine print. The government outlines its policy intentions; the opposition and crossbench put their case. This is the stage that determines whether the bill proceeds at all.",
    next: "Consideration in Detail (House) or Committee of the Whole (Senate), where the bill is examined clause by clause",
  },
  second_reading_amendment: {
    description:
      "A motion to amend the second reading is being considered. This is a procedural tool used to express formal concerns about the bill's intent or to push for it to be referred to a committee for further scrutiny before debate continues.",
    next: "Second Reading vote",
  },
  consideration_in_detail: {
    description:
      "The full House sits as a committee to examine the bill clause by clause. Any member can propose amendments to specific sections. This is where the detailed wording gets scrutinised and changed. It exists because the broad second reading debate does not go into the fine print of individual provisions.",
    next: "Third Reading, the final House vote before the bill moves to the Senate",
  },
  committee_of_whole: {
    description:
      "The full Senate sits as a committee to go through the bill clause by clause. Senators can propose and debate amendments to any part of the text. Senate committee stages tend to be more wide-ranging than the House equivalent, and crossbench senators often use this stage to extract concessions from the government in exchange for their support.",
    next: "Third Reading, the final Senate vote",
  },
  third_reading: {
    description:
      "The final vote in this chamber on the bill as a whole, after all amendments have been considered. If it passes, the bill moves to the other chamber to go through the same process. If both chambers have already agreed to identical text, the bill proceeds directly to Royal Assent.",
    next: "The other chamber, which runs the same process from First Reading, or Royal Assent if both chambers have already agreed",
  },
  passed: {
    description:
      "Both the House and the Senate have agreed to the same version of the bill. It now goes to the Governor-General for Royal Assent, the final formal step before it becomes an Act of Parliament.",
    next: "Royal Assent, at which point the bill becomes law",
  },
  royal_assent: {
    description:
      "The Governor-General has formally approved the bill on behalf of the Crown. From this point it is an Act of Parliament and has the full force of law. This step is almost always a formality once both chambers have agreed.",
    next: null,
  },
  withdrawn: {
    description:
      "The bill's sponsor has withdrawn it from consideration. This can happen if the government changes its policy position, if agreement is reached through other means, or if the bill has no realistic prospect of passing.",
    next: null,
  },
  lapsed: {
    description:
      "The bill was not passed before parliament was prorogued or dissolved, such as at the end of a term or before an election. It has no further effect and would need to be reintroduced by a new or returning government to proceed.",
    next: null,
  },
  defeated: {
    description:
      "The bill was voted down in a chamber and cannot proceed. It would need to be reintroduced as a new bill to have any further chance of becoming law.",
    next: null,
  },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("*, sitting_days(sitting_date), members(name_display, party_id, parties(name, short_name, colour_hex))")
    .eq("id", id)
    .single();

  if (!bill) notFound();

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, subject, result, ayes_count, noes_count, occurred_at")
    .eq("bill_id", id)
    .order("occurred_at");

  const member = bill.members as {
    name_display: string;
    party_id: string | null;
    parties?: { name: string; short_name: string; colour_hex: string | null } | null;
  } | null;

  const sittingDay = bill.sitting_days as { sitting_date: string } | null;
  const dateStr = sittingDay?.sitting_date ?? bill.introduced_date;
  const ago = dateStr
    ? formatDistanceToNowStrict(parseISO(dateStr), { addSuffix: true })
    : null;

  const stageInfo = bill.bill_stage ? STAGE_INFO[bill.bill_stage] : null;
  const stageLabel = bill.bill_stage
    ? (bill.bill_stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    : null;

  return (
    <div className="space-y-6">
      <Link href="/bills" className="text-sm text-blue-600 hover:underline">
        ← Bills
      </Link>

      {/* Title + meta */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{bill.short_title}</h1>
          {stageLabel && (
            <span className="shrink-0 text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium">
              {stageLabel}
            </span>
          )}
        </div>

        {bill.long_title && bill.long_title !== bill.short_title && (
          <p className="text-sm text-gray-500 leading-relaxed">{bill.long_title}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          {member && (
            <span className="flex items-center gap-2">
              Introduced by {member.name_display}
              {member.parties && <PartyBadge party={member.parties} />}
            </span>
          )}
          {dateStr && (
            <span>
              {format(parseISO(dateStr), "d MMMM yyyy")}
              {ago && <span className="text-gray-400"> · {ago}</span>}
            </span>
          )}
          {bill.source_url && (
            <a
              href={bill.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View on APH →
            </a>
          )}
        </div>
      </div>

      {/* AI summary */}
      {bill.ai_summary && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-gray-700">Summary</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{bill.ai_summary}</p>
        </div>
      )}

      {/* Pipeline */}
      <BillPipeline stage={bill.bill_stage} parliamentId={bill.parliament_id} />

      {/* Stage explanation */}
      {stageInfo && (
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-gray-700">What happens at this stage</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{stageInfo.description}</p>
          {stageInfo.next && (
            <p className="text-sm text-gray-500">
              <span className="font-medium">Next:</span> {stageInfo.next}
            </p>
          )}
        </div>
      )}

      {/* Related divisions */}
      {divisions && divisions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Divisions on this bill
          </h2>
          <div className="space-y-2">
            {divisions.map((div) => {
              const passed = div.result === "passed";
              return (
                <Link
                  key={div.id}
                  href={`/divisions/${div.id}`}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 mr-4">{div.subject}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm text-gray-500">
                      <span className="text-green-600 font-medium">{div.ayes_count}</span>
                      {" – "}
                      <span className="text-red-600 font-medium">{div.noes_count}</span>
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      {passed ? "PASSED" : "DEFEATED"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
