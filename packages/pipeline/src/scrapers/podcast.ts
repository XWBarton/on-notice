/**
 * Finds the Question Time podcast episode for a given date and chamber
 * from the official Australian Parliament podcast RSS feeds (Podbean).
 */

const FEEDS: Record<"fed_hor" | "fed_sen", string> = {
  fed_hor: "https://feed.podbean.com/houseofrepsau/feed.xml",
  fed_sen: "https://feed.podbean.com/senateau/feed.xml",
};

export interface PodcastEpisode {
  audioUrl: string;
  durationSec: number;
  title: string;
}

/**
 * Find the podcast episode for a given sitting day.
 * Matches by title which contains the date in DD/MM/YYYY format,
 * e.g. "Question Time | 25/03/2026".
 */
export async function findPodcastEpisode(
  date: string, // "YYYY-MM-DD"
  chamber: "fed_hor" | "fed_sen"
): Promise<PodcastEpisode | null> {
  const [yyyy, mm, dd] = date.split("-");
  const titleDate = `${dd}/${mm}/${yyyy}`; // "25/03/2026"

  console.log(`  Fetching podcast RSS for ${date} (${chamber})...`);

  const res = await fetch(FEEDS[chamber]);
  if (!res.ok) {
    console.warn(`  Podcast RSS fetch failed: ${res.status}`);
    return null;
  }

  const xml = await res.text();

  // Split on <item> blocks and find the one whose <title> contains the date
  const items = xml.split("<item>");
  for (const item of items.slice(1)) {
    const titleMatch = item.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s);
    const title = titleMatch?.[1]?.trim() ?? "";
    if (!title.includes(titleDate)) continue;

    const enclosureMatch = item.match(/<enclosure[^>]+url="([^"]+)"/);
    const audioUrl = enclosureMatch?.[1];
    if (!audioUrl) continue;

    const durationMatch = item.match(/<itunes:duration>(\d+)<\/itunes:duration>/);
    const durationSec = durationMatch ? parseInt(durationMatch[1], 10) : 0;

    console.log(`  Found podcast episode: ${title} (${Math.round(durationSec / 60)}min)`);
    return { audioUrl, durationSec, title };
  }

  console.warn(`  No podcast episode found for ${date} (${chamber})`);
  return null;
}
