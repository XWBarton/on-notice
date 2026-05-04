import { db } from "./client";
import type { TVFYDivision } from "../scrapers/tvfy-divisions";
import type { ParsedDivisionTime } from "../parsers/hansard-xml";

function normaliseTitle(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractBillTitleFromSubject(subject: string): string | null {
  // Strip "Bills — " or "Bills - " prefix
  const cleaned = subject.replace(/^Bills?\s*[—–-]\s*/i, "").trim();
  // Capture everything up to and including "Bill YYYY"
  const match = cleaned.match(/^(.+?\bBill\s+\d{4})\b/i);
  return match ? match[1].trim() : null;
}

/**
 * After bills are upserted for a sitting day, match each division subject
 * to a bill and set the bill_id FK. Safe to call multiple times.
 */
export async function linkDivisionsToBills(sittingDayId: number) {
  const [{ data: bills }, { data: divisions }] = await Promise.all([
    db.from("bills").select("id, short_title").eq("sitting_day_id", sittingDayId),
    db.from("divisions").select("id, subject").eq("sitting_day_id", sittingDayId),
  ]);

  if (!bills?.length || !divisions?.length) return;

  for (const div of divisions) {
    const extracted = extractBillTitleFromSubject(div.subject);
    if (!extracted) continue;
    const normDiv = normaliseTitle(extracted);

    const bill = bills.find(
      (b) => normaliseTitle(b.short_title.replace(/\s*;.*$/, "")) === normDiv
    );
    if (!bill) continue;

    await db.from("divisions").update({ bill_id: bill.id }).eq("id", div.id);
  }
}

export async function upsertDivisions(
  sittingDayId: number,
  parliamentId: string,
  divisions: TVFYDivision[],
  memberLookup: (lastName: string, firstName: string, party: string) => string | null,
  divisionTimes: ParsedDivisionTime[] = []
) {
  for (const div of divisions) {
    const { data: existing } = await db
      .from("divisions")
      .select("id")
      .eq("sitting_day_id", sittingDayId)
      .eq("division_number", div.number)
      .maybeSingle();

    // Use OA htime if available (Canberra local, store as AEDT +11:00)
    const timeEntry = divisionTimes.find((t) => t.divisionNumber === div.number);
    const occurredAt = timeEntry
      ? `${div.date}T${timeEntry.htime}+11:00`
      : null;

    const divisionRow = {
      sitting_day_id: sittingDayId,
      division_number: div.number,
      subject: div.name,
      result: div.aye_votes > div.no_votes ? "passed" : "defeated",
      ayes_count: div.aye_votes,
      noes_count: div.no_votes,
      occurred_at: occurredAt,
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
      if (!v.member?.last_name) continue;
      const memberId = memberLookup(v.member.last_name, v.member.first_name, v.member.party);
      if (!memberId) {
        console.warn(`Could not find member: ${v.member.first_name} ${v.member.last_name} (${v.member.party})`);
        continue;
      }

      await db.from("division_votes").upsert(
        { division_id: divisionId, member_id: memberId, vote: v.vote },
        { onConflict: "division_id,member_id" }
      );
    }
  }
}
