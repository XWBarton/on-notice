import { createClient } from "@/lib/supabase";
import Link from "next/link";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 3600;

const STAGE_INFO: Record<string, { label: string; description: string; next: string | null }> = {
  first_reading: {
    label: "First Reading",
    description: "The bill has been introduced and tabled — no debate yet.",
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
    description: "The final vote before the bill passes to the other chamber or receives assent.",
    next: "Other chamber / Royal Assent",
  },
  passed: {
    label: "Passed",
    description: "The bill has been passed by both chambers and is awaiting Royal Assent.",
    next: "Royal Assent",
  },
  royal_assent: {
    label: "Royal Assent",
    description: "The Governor-General has signed the bill into law.",
    next: null,
  },
  withdrawn: {
    label: "Withdrawn",
    description: "The bill has been withdrawn by its sponsor.",
    next: null,
  },
  lapsed: {
    label: "Lapsed",
    description: "The bill lapsed at the end of a parliamentary term without being passed.",
    next: null,
  },
  defeated: {
    label: "Defeated",
    description: "The bill was voted down and will not proceed further.",
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

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ parliament?: string }>;
}) {
  const { parliament: parliamentParam } = await searchParams;
  const parliamentId = parliamentParam === "fed_sen" ? "fed_sen" : "fed_hor";

  const supabase = createClient();

  const { data: bills } = await supabase
    .from("bills")
    .select(
      "id, short_title, bill_stage, introduced_date, introduced_by, members(name_display, party_id, parties(name, short_name, colour_hex))"
    )
    .eq("parliament_id", parliamentId)
    .order("introduced_date", { ascending: false })
    .limit(200);

  // Group by introduced_date
  const grouped = new Map<string, typeof bills>();
  for (const bill of bills ?? []) {
    const date = bill.introduced_date ?? "unknown";
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(bill);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bills</h1>
        <div className="flex gap-2">
          <Link
            href="/bills"
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              parliamentId === "fed_hor"
                ? "bg-[#006945] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            House
          </Link>
          <Link
            href="/bills?parliament=fed_sen"
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              parliamentId === "fed_sen"
                ? "bg-[#C1121F] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Senate
          </Link>
        </div>
      </div>

      {grouped.size === 0 && (
        <p className="text-gray-500 text-sm">No bills found.</p>
      )}

      {Array.from(grouped.entries()).map(([date, dateBills]) => (
        <section key={date}>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {date !== "unknown" ? format(parseISO(date), "EEEE d MMMM yyyy") : "Unknown date"}
          </h2>
          <div className="space-y-2">
            {(dateBills ?? []).map((bill) => {
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
                      {info?.description && (
                        <p className="text-xs text-gray-500 mt-1">{info.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {info && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
                          {info.label}
                        </span>
                      )}
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
      ))}
    </div>
  );
}
