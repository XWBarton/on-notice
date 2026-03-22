/**
 * Fetches current federal members from the OpenAustralia API.
 * Endpoint docs: https://www.openaustralia.org.au/api/
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
  house: "commons" | "lords"; // OA uses UK naming; 'commons' = HoR, 'lords' = Senate
  entered_house: string;
  left_house?: string;
}

export async function syncFederalMembers(parliamentId: "fed_hor" | "fed_sen") {
  const house = parliamentId === "fed_hor" ? "representatives" : "senate";
  const apiKey = process.env.OPEN_AUSTRALIA_API_KEY;

  const url = `${OPEN_AUSTRALIA_API}/get${
    house === "representatives" ? "Representatives" : "Senators"
  }?key=${apiKey}&output=js`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenAustralia API error: ${res.status}`);

  const data = await res.json();
  const members: OAMember[] = data.representatives ?? data.senators ?? [];

  console.log(`Fetched ${members.length} members for ${parliamentId}`);

  for (const m of members) {
    const partyKey = Object.keys(FEDERAL_PARTIES).find(
      (k) => k.toLowerCase() === m.party.toLowerCase()
    );
    const party = partyKey ? FEDERAL_PARTIES[partyKey] : FEDERAL_PARTIES["Independent"];

    // Ensure party exists in DB
    await db.from("parties").upsert(
      {
        id: party.id,
        name: party.name,
        short_name: party.short_name,
        colour_hex: party.colour_hex,
        jurisdiction: "federal",
      },
      { onConflict: "id" }
    );

    const memberId = `${parliamentId}_${m.last_name.toLowerCase()}_${m.first_name.toLowerCase()}`.replace(
      /[^a-z_]/g,
      ""
    );

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
