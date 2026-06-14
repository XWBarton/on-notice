import * as cheerio from "cheerio";
import { waFetch } from "./http";

const BASE_URL = "https://www.parliament.wa.gov.au";

export type WAChamber = "assembly" | "council";

export interface WAVideoListing {
  uuid: string;
  title: string;
  /** Full URL: /watch/video/{uuid}?chapter={n} */
  href: string;
  chamber: WAChamber;
  /** Sitting date in YYYY-MM-DD, parsed from the gallery card */
  date: string | null;
  /** Chapter number from the gallery link, if present */
  chapter: number | null;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

/** "11 June 2026" → "2026-06-11" */
function parseCardDate(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

/**
 * Fetch the WA Parliament video gallery for a given chamber + proceeding
 * category, newest first. Each gallery item is a `?chapter=N` segment of the
 * day's broadcast, already trimmed to that single proceeding.
 */
export async function fetchGalleryListings(
  chamber: WAChamber,
  category: string,
  pagesize = 20
): Promise<WAVideoListing[]> {
  const url = new URL(`${BASE_URL}/watch/gallery/${chamber}`);
  url.searchParams.set("category", category);
  url.searchParams.set("pagesize", String(pagesize));
  url.searchParams.set("page", "1");

  console.log(`  Fetching WA gallery: ${url}`);
  const res = await waFetch(url.toString());
  if (!res.ok) throw new Error(`Gallery fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const listings: WAVideoListing[] = [];

  $("a.vod-gallery-item").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).attr("title") ?? $(el).find(".vod-gallery-item-title").text().trim();
    const uuidMatch = href.match(/\/watch\/video\/([a-f0-9]{32})/);
    if (!uuidMatch) return;
    const date = parseCardDate($(el).find(".vod-gallery-item-details").text());
    const chapterMatch = href.match(/[?&]chapter=(\d+)/);
    listings.push({
      uuid: uuidMatch[1],
      title,
      href,
      chamber,
      date,
      chapter: chapterMatch ? parseInt(chapterMatch[1], 10) : null,
    });
  });

  console.log(`  Found ${listings.length} "${category}" items`);
  return listings;
}

/**
 * Fetch "Questions Without Notice" listings for a chamber, newest first.
 */
export async function fetchQuestionsWithoutNotice(
  chamber: WAChamber
): Promise<WAVideoListing[]> {
  return fetchGalleryListings(chamber, "Questions Without Notice");
}
