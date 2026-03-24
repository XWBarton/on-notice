import { createClient } from "@/lib/supabase";

export const revalidate = 3600;

export async function GET() {
  const supabase = createClient();

  // Pull from sitting_days directly since we store audio_url there
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
    .eq("parliament_id", "fed_hor")
    .order("sitting_date", { ascending: false })
    .limit(50);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://on-notice.xyz";
  const iconUrl = `${siteUrl}/icon.svg`;

  const items = (sittingDays ?? [])
    .map((day: any) => {
      const digest = Array.isArray(day.daily_digests) ? day.daily_digests[0] : day.daily_digests;
      const questions = (day.questions ?? [])
        .filter((q: any) => !q.is_dorothy_dixer)
        .sort((a: any, b: any) => (a.question_number ?? 0) - (b.question_number ?? 0));

      const pubDate = new Date(day.sitting_date).toUTCString();
      const title = `${formatDate(day.sitting_date)} — Question Time`;
      const description = digest?.lede ?? `Question Time from the Australian House of Representatives, ${formatDate(day.sitting_date)}.`;
      const guid = `${siteUrl}/podcast/${day.sitting_date}`;
      const durationSec = day.audio_duration_sec ?? 0;

      // Podcasting 2.0: chapters (one per real question)
      const chapters = questions
        .map((q: any, i: number) => {
          const chapterTitle = q.subject
            ? `Q${q.question_number}: ${q.subject}`
            : `Question ${q.question_number}`;
          const startTime = Math.round((i / Math.max(questions.length, 1)) * durationSec);
          return `<podcast:chapter start="${startTime}" title="${escapeXml(chapterTitle)}" />`;
        })
        .join("\n        ");

      // Podcasting 2.0: persons (askers and ministers)
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
    <title>On Notice — Australian Parliament Question Time</title>
    <link>${siteUrl}/podcast</link>
    <description>Daily question time from the Australian House of Representatives — Dorothy Dixers removed. Just the real scrutiny.</description>
    <language>en-AU</language>
    <copyright>Creative Commons CC BY-NC-ND 3.0 AU</copyright>
    <itunes:author>On Notice</itunes:author>
    <itunes:category text="News">
      <itunes:category text="Politics" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:image href="${iconUrl}" />
    <itunes:owner>
      <itunes:name>On Notice</itunes:name>
    </itunes:owner>
    <podcast:guid>onnotice-fed-hor-question-time</podcast:guid>
    <podcast:locked>no</podcast:locked>
    <podcast:medium>podcast</podcast:medium>
    <podcast:image href="${iconUrl}" />
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
