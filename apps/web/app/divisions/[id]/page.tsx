import { createClient } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { PartyBadge } from "@/components/Member/PartyBadge";

export const revalidate = 86400;

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createClient();

  const { data: division } = await supabase
    .from("divisions")
    .select("*, sitting_days(sitting_date, parliament_id), bills(short_title, source_url)")
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

  const passed = division.result === "passed";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 leading-snug">{division.subject}</h1>
        <div className="flex items-center gap-3 mt-2">
          <span
            className={`text-sm font-semibold px-2 py-1 rounded ${
              passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {passed ? "PASSED" : "DEFEATED"}
          </span>
          <span className="text-sm text-gray-500">
            {division.ayes_count} Ayes — {division.noes_count} Noes
          </span>
        </div>
        {division.bills && (
          <div className="mt-2 text-sm text-gray-500">
            Re:{" "}
            <a href={division.bills.source_url ?? "#"} className="text-blue-600 hover:underline">
              {division.bills.short_title}
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <VoteColumn label="Ayes" votes={ayes} />
        <VoteColumn label="Noes" votes={noes} />
      </div>
    </div>
  );
}

function VoteColumn({
  label,
  votes,
}: {
  label: string;
  votes: Array<{
    vote: string;
    members?: {
      name_display: string;
      parties?: { short_name: string; colour_hex: string | null } | null;
    } | null;
  }>;
}) {
  const isAye = label === "Ayes";
  return (
    <div>
      <h2
        className={`text-sm font-semibold mb-2 ${
          isAye ? "text-green-700" : "text-red-700"
        }`}
      >
        {label} ({votes.length})
      </h2>
      <div className="space-y-1">
        {votes.map((v, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-gray-800">{v.members?.name_display}</span>
            {v.members?.parties && <PartyBadge party={v.members.parties} />}
          </div>
        ))}
      </div>
    </div>
  );
}
