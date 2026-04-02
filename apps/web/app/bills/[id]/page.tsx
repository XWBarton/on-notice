import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import Link from "next/link";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 86400;

const STAGE_INFO: Record<string, { label: string; description: string; next: string | null }> = {
  first_reading: {
    label: "First Reading",
    description:
      "The bill has been formally introduced and tabled in the chamber. No debate has taken place yet — this is purely procedural.",
    next: "Second Reading — debate on the bill's general principles",
  },
  second_reading: {
    label: "Second Reading",
    description:
      "Members are debating whether the chamber should in principle agree to the bill. Speeches focus on the overall purpose and policy, not specific clauses.",
    next: "Consideration in Detail or Committee of the Whole — clause-by-clause examination",
  },
  second_reading_amendment: {
    label: "Second Reading Amendment",
    description:
      "An amendment to the second reading motion is being debated. This is often used to express concerns about the bill or refer it to a committee.",
    next: "Second Reading vote",
  },
  consideration_in_detail: {
    label: "Consideration in Detail",
    description:
      "The House of Representatives is examining the bill clause by clause. Members can propose and debate specific amendments to the text.",
    next: "Third Reading — final vote before the bill moves to the Senate",
  },
  committee_of_whole: {
    label: "Committee of the Whole",
    description:
      "The Senate is examining the bill clause by clause. Senators can propose amendments, and debate can be wide-ranging.",
    next: "Third Reading — final Senate vote",
  },
  third_reading: {
    label: "Third Reading",
    description:
      "The bill has cleared its committee stage. This is the final vote in the current chamber before it passes to the other chamber (or receives Royal Assent if it has passed both).",
    next: "Other chamber / Royal Assent",
  },
  passed: {
    label: "Passed",
    description:
      "Both the House and the Senate have agreed to the bill in the same form. It is now awaiting the Governor-General's signature to become law.",
    next: "Royal Assent — becomes an Act of Parliament",
  },
  royal_assent: {
    label: "Royal Assent",
    description:
      "The Governor-General has given Royal Assent. The bill is now an Act of Parliament and has the force of law.",
    next: null,
  },
  withdrawn: {
    label: "Withdrawn",
    description: "The bill has been withdrawn by its sponsor and will not proceed further.",
    next: null,
  },
  lapsed: {
    label: "Lapsed",
    description:
      "The bill lapsed at the end of a parliamentary term or session without being passed. It would need to be reintroduced to proceed.",
    next: null,
  },
  defeated: {
    label: "Defeated",
    description: "The bill was voted down. It cannot proceed further without being reintroduced.",
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

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: bill } = await supabase
    .from("bills")
    .select("*, members(name_display, party_id, parties(name, short_name, colour_hex))")
    .eq("id", id)
    .single();

  if (!bill) notFound();

  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, subject, result, ayes_count, noes_count, occurred_at")
    .eq("bill_id", id)
    .order("occurred_at");

  const info = stageInfo(bill.bill_stage);
  const member = bill.members as {
    name_display: string;
    party_id: string | null;
    parties?: { name: string; short_name: string; colour_hex: string | null } | null;
  } | null;

  const ago = bill.introduced_date
    ? formatDistanceToNowStrict(parseISO(bill.introduced_date), { addSuffix: true })
    : null;

  return (
    <div className="space-y-6">
      <Link href="/bills" className="text-sm text-blue-600 hover:underline">
        ← Bills
      </Link>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{bill.short_title}</h1>
          {info && (
            <span className="shrink-0 text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-medium">
              {info.label}
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
          {bill.introduced_date && (
            <span>
              {format(parseISO(bill.introduced_date), "d MMMM yyyy")}
              {ago && <span className="text-gray-400"> · {ago}</span>}
            </span>
          )}
        </div>
      </div>

      {info && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Current stage: {info.label}</h2>
          {info.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{info.description}</p>
          )}
          {info.next && (
            <p className="text-sm text-gray-500">
              <span className="font-medium">Next:</span> {info.next}
            </p>
          )}
          {!info.next && (
            <p className="text-sm text-gray-400 italic">No further stages.</p>
          )}
        </div>
      )}

      {bill.ai_summary && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Summary</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{bill.ai_summary}</p>
        </div>
      )}

      {bill.source_url && (
        <a
          href={bill.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-blue-600 hover:underline"
        >
          View on APH →
        </a>
      )}

      {divisions && divisions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
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
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                      }`}
                    >
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
