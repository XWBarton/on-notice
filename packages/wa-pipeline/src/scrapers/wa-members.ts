import * as cheerio from "cheerio";
import { WA_PARTIES, resolvePartyId } from "../config";

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

function parseMemberList(html: string, parliamentId: "wa_la" | "wa_lc"): WAMember[] {
  const $ = cheerio.load(html);
  const members: WAMember[] = [];

  // Each member entry wraps name, party, and electorate
  // The listing has <h3><a>Title First LAST</a> MLA/MLC</h3> and party info in adjacent <p>
  $("h3, .member-name, [class*='member']").each((_, el) => {
    const link = $(el).find("a").first();
    if (!link.length) return;

    const nameHref = link.attr("href") ?? "";
    const rawName = link.text().trim();
    if (!rawName) return;

    // Extract last name (usually in <strong>) and first from the full text
    const strong = link.find("strong").text().trim();
    const lastName = strong || rawName.split(/\s+/).pop() ?? rawName;
    const firstName = rawName
      .replace(/^(?:Mr|Ms|Mrs|Dr|Hon\.?)\s+/i, "")
      .replace(lastName, "")
      .trim();

    // Party is often in the next <p> or sibling text
    const container = $(el).closest("div, td, li");
    const partyRaw = container
      .find("p, span")
      .filter((_, e) => /^(ALP|LIB|NAT|GWA|ONP|AJP|AC|LCWA|IND)/i.test($(e).text().trim()))
      .first()
      .text()
      .trim()
      .split(/[\s,]/)[0];

    // Electorate — look for a link to an electorate profile
    const electorate = container
      .find("a[href*='electorate']")
      .first()
      .text()
      .trim() || null;

    // Unique ID from the name (WA Parliament has no numeric ID in member URLs)
    const slug = `${lastName.toLowerCase().replace(/[^a-z]/g, "")}_${firstName.toLowerCase().replace(/[^a-z]/g, "")}`;
    const id = `${parliamentId}_${slug}`;

    members.push({
      id,
      parliament_id: parliamentId,
      name_display: `${firstName} ${lastName}`.trim(),
      name_first: firstName,
      name_last: lastName,
      party_id: resolvePartyId(partyRaw || "IND"),
      electorate,
    });
  });

  return members;
}

/**
 * Upsert all WA parties and members into Supabase.
 */
export async function syncWAMembers(db: ReturnType<typeof import("@supabase/supabase-js").createClient>) {
  // Upsert parties first
  const parties = Object.values(WA_PARTIES).map((p) => ({
    ...p,
    jurisdiction: "wa",
  }));
  const { error: partyErr } = await db.from("parties").upsert(parties, { onConflict: "id" });
  if (partyErr) throw new Error(`Party upsert failed: ${partyErr.message}`);
  console.log(`  Upserted ${parties.length} WA parties`);

  // Scrape and upsert members
  const members = await scrapeWAMembers();
  if (members.length === 0) {
    console.warn("  No members scraped — skipping upsert");
    return;
  }

  const { error: memberErr } = await db.from("members").upsert(
    members.map((m) => ({ ...m, is_active: true, scraped_at: new Date().toISOString() })),
    { onConflict: "id" }
  );
  if (memberErr) throw new Error(`Member upsert failed: ${memberErr.message}`);
  console.log(`  Upserted ${members.length} WA members`);

  return members;
}
