import { createClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const revalidate = 3600;

const CHAMBERS = {
  fed_hor: {
    name: "On Notice — House of Representatives",
    description:
      "Daily question time from the Australian House of Representatives — Dorothy Dixers removed. Just the real scrutiny. Visit on-notice.xyz for full transcripts, divisions, and bills.",
    guid: "onnotice-fed-hor-question-time",
    label: "House of Representatives",
  },
  fed_sen: {
    name: "On Notice — Senate",
    description:
      "Daily question time from the Australian Senate — Dorothy Dixers removed. Just the real scrutiny. Visit on-notice.xyz for full transcripts, divisions, and bills.",
    guid: "onnotice-fed-sen-question-time",
    label: "Senate",
  },
};

export async function GET(req: NextRequest) {
  const parliamentId = (req.nextUrl.searchParams.get("parliament") ?? "fed_hor") as keyof typeof CHAMBERS;
  const chamber = CHAMBERS[parliamentId] ?? CHAMBERS.fed_hor;

  const supabase = createClient();

  const { data: sittingDays } = await supabase
    .from("sitting_days")
    .select(`
      id,
      sitting_date,
      parliament_id,
      audio_url,
      audio_duration_sec,
      daily_digests(lede, ai_summary),
      questions(question_number, asker_name, asker_party, minister_name, subject, is_dorothy_dixer)
    `)
    .not("audio_url", "is", null)
    .eq("parliament_id", parliamentId)
    .order("sitting_date", { ascending: false })
    .limit(50);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://on-notice.xyz";
  const artworkUrl = parliamentId === "fed_sen"
    ? `${siteUrl}/podcast-artwork-senate.png`
    : `${siteUrl}/podcast-artwork.png`;

  const items = (sittingDays ?? [])
    .map((day: any) => {
      const digest = Array.isArray(day.daily_digests) ? day.daily_digests[0] : day.daily_digests;
      const questions = (day.questions ?? [])
        .filter((q: any) => !q.is_dorothy_dixer)
        .sort((a: any, b: any) => (a.question_number ?? 0) - (b.question_number ?? 0));

      const pubDate = new Date(day.sitting_date).toUTCString();
      const title = `${formatDate(day.sitting_date)} — Question Time`;
      const description = digest?.lede
        ? `${digest.lede}\n\nVisit on-notice.xyz for full transcripts, divisions, and bills.`
        : `Question Time from the Australian ${chamber.label}, ${formatDate(day.sitting_date)}. Visit on-notice.xyz for full transcripts, divisions, and bills.`;
      const guid = `${siteUrl}/${day.sitting_date}?parliament=${parliamentId}`;
      const durationSec = day.audio_duration_sec ?? 0;

      const chapters = questions
        .map((q: any, i: number) => {
          const chapterTitle = q.subject
            ? `Q${q.question_number}: ${q.subject}`
            : `Question ${q.question_number}`;
          const startTime = Math.round((i / Math.max(questions.length, 1)) * durationSec);
          return `<podcast:chapter start="${startTime}" title="${escapeXml(chapterTitle)}" />`;
        })
        .join("\n        ");

      const persons = questions
        .slice(0, 5)
        .flatMap((q: any) => {
          const out = [];
          if (q.asker_name) out.push(`<podcast:person role="guest">${escapeXml(q.asker_name)}</podcast:person>`);
          if (q.minister_name) out.push(`<podcast:person role="host">${escapeXml(q.minister_name)}</podcast:person>`);
          return out;
        })
        .join("\n        ");

      return `
    <item>
      <title>${escapeXml(title)}</title>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${guid}</guid>
      <link>${guid}</link>
      <description>${escapeXml(description)}</description>
      <itunes:image href="${artworkUrl}" />
      <enclosure url="${day.audio_url}" type="audio/mpeg" length="0" />
      <itunes:duration>${durationSec}</itunes:duration>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <podcast:episodeType>full</podcast:episodeType>
      ${chapters ? `<podcast:chapters>\n        ${chapters}\n      </podcast:chapters>` : ""}
      ${persons}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>${escapeXml(chamber.name)}</title>
    <link>${siteUrl}/podcast</link>
    <description>${escapeXml(chamber.description)}</description>
    <language>en-AU</language>
    <copyright>Creative Commons CC BY-NC-ND 3.0 AU</copyright>
    <itunes:author>On Notice</itunes:author>
    <itunes:category text="News">
      <itunes:category text="Politics" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${artworkUrl}" />
    <itunes:owner>
      <itunes:name>On Notice</itunes:name>
    </itunes:owner>
    <podcast:guid>${chamber.guid}</podcast:guid>
    <podcast:locked>no</podcast:locked>
    <podcast:medium>podcast</podcast:medium>
    <podcast:image href="${artworkUrl}" />
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
    timeZone: "Australia/Sydney",
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
