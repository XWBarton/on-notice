import { db } from "./client";
import type { TVFYDivision } from "../scrapers/tvfy-divisions";

export async function upsertDivisions(
  sittingDayId: number,
  parliamentId: string,
  divisions: TVFYDivision[],
  memberLookup: (lastName: string, firstName: string, party: string) => string | null
) {
  for (const div of divisions) {
    const { data: existing } = await db
      .from("divisions")
      .select("id")
      .eq("sitting_day_id", sittingDayId)
      .eq("division_number", div.number)
      .maybeSingle();

    const divisionRow = {
      sitting_day_id: sittingDayId,
      division_number: div.number,
      subject: div.name,
      result: div.outcome === "passed" ? "passed" : "defeated",
      ayes_count: div.aye_votes,
      noes_count: div.no_votes,
      occurred_at: `${div.date}T00:00:00Z`,
    };

    let divisionId: number;

    if (existing) {
      await db.from("divisions").update(divisionRow).eq("id", existing.id);
      divisionId = existing.id;
    } else {
      const { data } = await db
        .from("divisions")
        .insert(divisionRow)
        .select("id")
        .single();
      divisionId = data!.id;
    }

    // Upsert individual votes from the detail endpoint
    const votes = div.votes ?? [];

    for (const v of votes) {
      const memberId = memberLookup(v.member.name.last, v.member.name.first, v.member.party);
      if (!memberId) {
        console.warn(`Could not find member: ${v.member.name.first} ${v.member.name.last} (${v.member.party})`);
        continue;
      }

      await db.from("division_votes").upsert(
        { division_id: divisionId, member_id: memberId, vote: v.vote },
        { onConflict: "division_id,member_id" }
      );
    }
  }
}
