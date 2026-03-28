import * as cheerio from "cheerio";
import { WA_PARTIES, resolvePartyId } from "../config";
import { db } from "../db/client";

const BASE = "https://www.parliament.wa.gov.au";

export interface WAMember {
  id: string;
  parliament_id: "wa_la" | "wa_lc";
  name_display: string;
  name_first: string;
  name_last: string;
  party_id: string;
  electorate: string | null;
}

const CHAMBER_URLS = {
  wa_la: `${BASE}/parliament/memblist.nsf/WebCurrentMembLA`,
  wa_lc: `${BASE}/parliament/memblist.nsf/WebCurrentMembLC`,
} as const;

/**
 * Scrape all current members from both WA chambers.
 */
export async function scrapeWAMembers(): Promise<WAMember[]> {
  const [la, lc] = await Promise.all([
    scrapeChamber("wa_la"),
    scrapeChamber("wa_lc"),
  ]);
  console.log(`  Scraped ${la.length} LA + ${lc.length} LC members`);
  return [...la, ...lc];
}

async function scrapeChamber(parliamentId: "wa_la" | "wa_lc"): Promise<WAMember[]> {
  const url = CHAMBER_URLS[parliamentId];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Member list fetch failed (${parliamentId}): ${res.status}`);
  const html = await res.text();
  return parseMemberList(html, parliamentId);
}

/**
 * Row structure (4 <td> columns):
 *   [0] photo <img>
 *   [1] <a>Mr First <b>LAST</b></a> MLA\nParty: ALP
 *   [2] <a href="...electorate...">Electorate name</a>
 *   [3] office address
 */
function parseMemberList(html: string, parliamentId: "wa_la" | "wa_lc"): WAMember[] {
  const $ = cheerio.load(html);
  const members: WAMember[] = [];

  $("tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const nameCell = $(cells[1]);
    const link = nameCell.find("a").first();
    if (!link.length) return;

    // Last name is in <b>, first name is the rest
    const lastName = link.find("b").text().trim();
    const fullText = link.text().trim();
    // Remove title prefix (Mr/Ms/Mrs/Dr/Hon) and last name to get first name
    const firstName = fullText
      .replace(/^(?:Mr|Ms|Mrs|Dr|Hon\.?)\s+/i, "")
      .replace(lastName, "")
      .trim();

    // Party: "Party: ALP" in the name cell text
    const cellText = nameCell.text();
    const partyMatch = cellText.match(/Party:\s*([A-Z]+)/i);
    const partyCode = partyMatch?.[1]?.toUpperCase() ?? "IND";

    // Electorate from 3rd column link
    const electorate = $(cells[2]).find("a").first().text().trim() || null;

    // Use Lotus Notes image ID as unique identifier
    const imgSrc = $(cells[0]).find("img").attr("src") ?? "";
    const notesIdMatch = imgSrc.match(/\(MemberPics\)\/([A-F0-9]+)\//i);
    const notesId = notesIdMatch?.[1]?.toLowerCase() ?? `${lastName}_${firstName}`.toLowerCase().replace(/\s+/g, "_");
    const id = `${parliamentId}_${notesId}`;

    members.push({
      id,
      parliament_id: parliamentId,
      name_display: `${firstName} ${lastName}`.trim(),
      name_first: firstName,
      name_last: lastName,
      party_id: resolvePartyId(partyCode),
      electorate,
    });
  });

  return members;
}

/**
 * Upsert all WA parties and members into Supabase.
 */
export async function syncWAMembers() {
  // Upsert parties first
  const parties = Object.values(WA_PARTIES).map((p) => ({
    ...p,
    jurisdiction: "wa",
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: partyErr } = await (db as any).from("parties").upsert(parties, { onConflict: "id" });
  if (partyErr) throw new Error(`Party upsert failed: ${partyErr.message}`);
  console.log(`  Upserted ${parties.length} WA parties`);

  // Scrape and upsert members
  const members = await scrapeWAMembers();
  if (members.length === 0) {
    console.warn("  No members scraped — skipping upsert");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: memberErr } = await (db as any).from("members").upsert(
    members.map((m) => ({ ...m, is_active: true, scraped_at: new Date().toISOString() })),
    { onConflict: "id" }
  );
  if (memberErr) throw new Error(`Member upsert failed: ${memberErr.message}`);
  console.log(`  Upserted ${members.length} WA members`);

  return members;
}
