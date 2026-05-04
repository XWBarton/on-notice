import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { PartyBadge } from "@/components/Member/PartyBadge";
import { DivisionSummary } from "@/components/DivisionSummary";

export const revalidate = 86400;

type VoteRow = {
  vote: string;
  members?: {
    name_display: string;
    name_last: string;
    party_id: string | null;
    parties?: { name: string; short_name: string; colour_hex: string | null } | null;
  } | null;
};

type PartyGroup = {
  shortName: string;
  colour: string;
  members: string[];
};

function groupByParty(votes: VoteRow[]): PartyGroup[] {
  const map = new Map<string, PartyGroup>();
  for (const v of votes) {
    const party = v.members?.parties;
    const key = party?.short_name ?? "IND";
    if (!map.has(key)) {
      map.set(key, {
        shortName: key,
        colour: party?.colour_hex ?? "#9ca3af",
        members: [],
      });
    }
    map.get(key)!.members.push(v.members?.name_display ?? "");
  }
  return [...map.values()].sort((a, b) => b.members.length - a.members.length);
}

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("*, sitting_days(sitting_date, parliament_id), bills(id, short_title, source_url)")
    .eq("id", id)
    .single();

  if (!division) notFound();

  const { data: votes } = await supabase
    .from("division_votes")
    .select("vote, members(name_display, name_last, party_id, parties(name, short_name, colour_hex))")
    .eq("division_id", id)
    .order("vote");

  const ayes = votes?.filter((v) => v.vote === "aye") ?? [];
  const noes = votes?.filter((v) => v.vote === "no") ?? [];
  const total = ayes.length + noes.length;
  const passed = division.result === "passed";

  const ayeGroups = groupByParty(ayes as VoteRow[]);
  const noeGroups = groupByParty(noes as VoteRow[]);

  const sittingDay = division.sitting_days as { sitting_date: string; parliament_id: string } | null;
  const chamberLabel = sittingDay?.parliament_id === "fed_sen" ? "Senate" : "House of Representatives";

  return (
    <div className="space-y-6">
      {sittingDay && (
        <Link
          href={`/${sittingDay.sitting_date}?parliament=${sittingDay.parliament_id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          ← {format(parseISO(sittingDay.sitting_date), "d MMMM yyyy")} · {chamberLabel}
        </Link>
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900 leading-snug">{division.subject}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span className={`text-sm font-semibold px-2 py-1 rounded ${passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {passed ? "PASSED" : "DEFEATED"}
          </span>
          <span className="text-sm text-gray-500">
            {division.ayes_count} Ayes · {division.noes_count} Noes
          </span>
        </div>

        {division.bills && (
          <div className="mt-2 text-sm text-gray-500">
            Bill:{" "}
            <Link href={`/bills/${division.bills.id}`} className="text-blue-600 hover:underline">
              {division.bills.short_title}
            </Link>
          </div>
        )}

        <DivisionSummary
          ai_summary={(division as { ai_summary?: string | null }).ai_summary ?? null}
          brainrot_summary={(division as { brainrot_summary?: string | null }).brainrot_summary ?? null}
        />
      </div>

      {/* Party breakdown — two labelled rows */}
      {total > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Party breakdown</p>

          {/* Aye row */}
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-bold text-green-700 text-right">
              AYE {ayes.length}
            </span>
            <div className="flex flex-1 rounded overflow-hidden h-6 gap-px">
              {ayeGroups.map((g) => (
                <div
                  key={g.shortName}
                  title={`${g.shortName}: ${g.members.length}`}
                  style={{ width: `${(g.members.length / total) * 100}%`, backgroundColor: g.colour }}
                />
              ))}
            </div>
          </div>

          {/* Noe row */}
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs font-bold text-red-600 text-right">
              NOE {noes.length}
            </span>
            <div className="flex flex-1 rounded overflow-hidden h-6 gap-px">
              {noeGroups.map((g) => (
                <div
                  key={g.shortName}
                  title={`${g.shortName}: ${g.members.length}`}
                  style={{ width: `${(g.members.length / total) * 100}%`, backgroundColor: g.colour }}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 pl-12">
            {[...ayeGroups, ...noeGroups]
              .reduce<PartyGroup[]>((acc, g) => {
                if (!acc.find((x) => x.shortName === g.shortName)) acc.push(g);
                return acc;
              }, [])
              .map((g) => {
                const ayeCount = ayeGroups.find((x) => x.shortName === g.shortName)?.members.length ?? 0;
                const noeCount = noeGroups.find((x) => x.shortName === g.shortName)?.members.length ?? 0;
                return (
                  <div key={g.shortName} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: g.colour }} />
                    <span className="font-medium">{g.shortName}</span>
                    {ayeCount > 0 && <span className="text-green-700">{ayeCount} aye</span>}
                    {ayeCount > 0 && noeCount > 0 && <span className="text-gray-300">·</span>}
                    {noeCount > 0 && <span className="text-red-600">{noeCount} noe</span>}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Vote columns grouped by party */}
      <div className="grid grid-cols-2 gap-6">
        <VoteColumn label="Ayes" groups={ayeGroups} />
        <VoteColumn label="Noes" groups={noeGroups} />
      </div>
    </div>
  );
}

function VoteColumn({ label, groups }: { label: string; groups: PartyGroup[] }) {
  const isAye = label === "Ayes";
  const total = groups.reduce((s, g) => s + g.members.length, 0);
  return (
    <div>
      <h2 className={`text-sm font-semibold mb-3 ${isAye ? "text-green-700" : "text-red-700"}`}>
        {label} ({total})
      </h2>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.shortName}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: g.colour }} />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {g.shortName} · {g.members.length}
              </span>
            </div>
            <div className="space-y-0.5 pl-3.5">
              {g.members.map((name) => (
                <div key={name} className="text-sm text-gray-800">{name}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
