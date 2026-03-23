/**
 * Fetches current federal members from the OpenAustralia API.
 * Docs: https://www.openaustralia.org.au/api/
 */

import { OPEN_AUSTRALIA_API, FEDERAL_PARTIES } from "../config";
import { db } from "../db/client";

interface OAMember {
  member_id: string;
  name: string;
  first_name: string;
  last_name: string;
  constituency: string;
  party: string;
  house: string;
  entered_house: string;
  left_house?: string;
}

export async function syncFederalMembers(parliamentId: "fed_hor" | "fed_sen") {
  const apiKey = process.env.OPEN_AUSTRALIA_API_KEY;
  const endpoint = parliamentId === "fed_hor" ? "getRepresentatives" : "getSenators";

  const url = `${OPEN_AUSTRALIA_API}/${endpoint}?key=${apiKey}&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAustralia API error: ${res.status}`);

  const raw = await res.json();
  // API returns array directly
  const members = (Array.isArray(raw) ? raw : []) as OAMember[];

  console.log(`Fetched ${members.length} members for ${parliamentId}`);

  for (const m of members) {
    // Match party name to our known parties, fall back to Independent
    const partyKey = Object.keys(FEDERAL_PARTIES).find(
      (k) => k.toLowerCase() === m.party.toLowerCase()
        || FEDERAL_PARTIES[k].short_name.toLowerCase() === m.party.toLowerCase()
    );
    const party = partyKey ? FEDERAL_PARTIES[partyKey] : {
      id: `other_${m.party.toLowerCase().replace(/[^a-z]/g, "")}`,
      name: m.party,
      short_name: m.party.slice(0, 6).toUpperCase(),
      colour_hex: "#9E9E9E",
    };

    await db.from("parties").upsert(
      { id: party.id, name: party.name, short_name: party.short_name, colour_hex: party.colour_hex, jurisdiction: "federal" },
      { onConflict: "id" }
    );

    const memberId = `${parliamentId}_${m.last_name}_${m.first_name}`
      .toLowerCase().replace(/[^a-z_]/g, "").slice(0, 80);

    await db.from("members").upsert(
      {
        id: memberId,
        parliament_id: parliamentId,
        name_display: `${m.first_name} ${m.last_name}`,
        name_last: m.last_name.toUpperCase(),
        name_first: m.first_name,
        party_id: party.id,
        electorate: m.constituency,
        is_active: !m.left_house,
      },
      { onConflict: "id" }
    );
  }

  console.log(`Synced ${members.length} members for ${parliamentId}`);
}
