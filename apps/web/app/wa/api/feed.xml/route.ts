import { createClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
  const supabase = createClient();

  const { data: daysRaw } = await supabase
    .from("sitting_days")
    .select("id, sitting_date, parliament_id, audio_url, audio_duration_sec")
    .not("audio_url", "is", null)
    .in("parliament_id", ["wa_la", "wa_lc"])
    .order("sitting_date", { ascending: false })
    .limit(50);

  type WADay = {
    id: string;
    sitting_date: string;
    parliament_id: string;
    audio_url: string;
    audio_duration_sec: number | null;
  };
  const days = (daysRaw ?? []) as WADay[];

  const siteUrl = "https://wa.on-notice.xyz";
  const artworkUrl = `${siteUrl}/icon.svg`;

  const items = days.map((day) => {
    const chamberLabel = day.parliament_id === "wa_la" ? "Legislative Assembly" : "Legislative Council";
    const title = `${formatDate(day.sitting_date)} — ${chamberLabel} Question Time`;
    const pubDate = new Date(day.sitting_date).toUTCString();
    const guid = `${siteUrl}/?${day.parliament_id === "wa_lc" ? "chamber=lc&" : ""}date=${day.sitting_date}`;
    const durationSec = day.audio_duration_sec ?? 0;

    return `
    <item>
      <title>${escapeXml(title)}</title>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <link>${siteUrl}</link>
      <description>${escapeXml(`Questions Without Notice from the WA ${chamberLabel}, ${formatDate(day.sitting_date)}. Visit wa.on-notice.xyz for full transcripts.`)}</description>
      <enclosure url="${day.audio_url}" type="audio/mpeg" length="0" />
      <itunes:duration>${durationSec}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>On Notice WA — Questions Without Notice</title>
    <link>${siteUrl}</link>
    <description>Questions Without Notice from the Western Australian Parliament. Visit wa.on-notice.xyz for full transcripts.</description>
    <language>en-AU</language>
    <copyright>Creative Commons CC BY-NC-ND 3.0 AU</copyright>
    <itunes:author>On Notice WA</itunes:author>
    <itunes:category text="News">
      <itunes:category text="Politics" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${artworkUrl}" />
    <itunes:owner>
      <itunes:name>On Notice WA</itunes:name>
    </itunes:owner>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Perth",
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
