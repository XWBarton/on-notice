import * as cheerio from "cheerio";

const BASE_URL = "https://www.parliament.wa.gov.au";

export type WAChamber = "assembly" | "council";

export interface WAVideoListing {
  uuid: string;
  title: string;
  /** Full URL: /watch/video/{uuid}?chapter={n} */
  href: string;
  chamber: WAChamber;
}

/**
 * Fetch the WA Parliament video gallery and return "Questions Without Notice"
 * listings for the given chamber, newest first.
 */
export async function fetchQuestionsWithoutNotice(
  chamber: WAChamber
): Promise<WAVideoListing[]> {
  const url = new URL(`${BASE_URL}/watch/gallery/${chamber}`);
  url.searchParams.set("category", "Questions Without Notice");
  url.searchParams.set("pagesize", "20");
  url.searchParams.set("page", "1");

  console.log(`  Fetching WA gallery: ${url}`);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Gallery fetch failed: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const listings: WAVideoListing[] = [];

  $("a.vod-gallery-item").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).attr("title") ?? $(el).find(".vod-gallery-item-title").text().trim();
    const uuidMatch = href.match(/\/watch\/video\/([a-f0-9]{32})/);
    if (!uuidMatch) return;
    listings.push({ uuid: uuidMatch[1], title, href, chamber });
  });

  console.log(`  Found ${listings.length} "Questions Without Notice" items`);
  return listings;
}
