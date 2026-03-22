import { createClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
  const supabase = createClient();

  const { data: episodesRaw } = await supabase
    .from("episodes")
    .select("id, title, description, audio_url, duration_sec, published_at, sitting_day_id")
    .not("audio_url", "is", null)
    .order("published_at", { ascending: false })
    .limit(50);

  const episodes = episodesRaw as Array<{
    id: number;
    title: string;
    description: string | null;
    audio_url: string | null;
    duration_sec: number | null;
    published_at: string | null;
    sitting_day_id: number;
  }> | null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://onnotice.au";

  const items = (episodes ?? [])
    .map((ep) => {
      const pubDate = ep.published_at
        ? new Date(ep.published_at).toUTCString()
        : new Date().toUTCString();

      return `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${siteUrl}/podcast/${ep.id}</guid>
      <link>${siteUrl}/podcast/${ep.id}</link>
      ${ep.description ? `<description>${escapeXml(ep.description)}</description>` : ""}
      ${ep.audio_url ? `<enclosure url="${ep.audio_url}" type="audio/mpeg" length="0" />` : ""}
      ${ep.duration_sec ? `<itunes:duration>${ep.duration_sec}</itunes:duration>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>On Notice — Australian Parliament Question Time</title>
    <link>${siteUrl}/podcast</link>
    <description>Daily question time from the Australian Parliament — Dorothy Dixers removed. Just the real scrutiny.</description>
    <language>en-AU</language>
    <itunes:author>On Notice</itunes:author>
    <itunes:category text="News" />
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${siteUrl}/podcast-cover.jpg" />
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
