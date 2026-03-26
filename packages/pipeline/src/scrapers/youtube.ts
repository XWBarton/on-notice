/**
 * Finds the Australian Parliament Live YouTube video for a given date and chamber,
 * and downloads the auto-generated captions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSubtitles } from "youtube-caption-extractor";

const execFileAsync = promisify(execFile);

const CHANNEL_URL = "https://www.youtube.com/@AUSParliamentLive/videos";

// Matched against both title and description (case-insensitive substring).
// The channel titles are just "Question Time | DD/MM/YYYY" — chamber info is in the description.
const CHAMBER_KEYWORDS: Record<"fed_hor" | "fed_sen", string[]> = {
  fed_hor: ["House of Representatives", "House Chamber", "House of Reps"],
  fed_sen: ["Senate Chamber", "Senate"],
};

export interface YouTubeVideo {
  videoId: string;
  title: string;
  uploadDate: string; // "YYYYMMDD"
}

/**
 * Find the Parliament Live YouTube VOD for a given date and chamber.
 *
 * Channel titles are "Question Time | DD/MM/YYYY" for both chambers — the
 * chamber is only mentioned in the video description (e.g. "Senate Chamber |
 * Question Time Podcast"). We match by upload_date and then check both title
 * and description for chamber keywords.
 */
export async function findParliamentYouTubeVideo(
  date: string,
  chamber: "fed_hor" | "fed_sen"
): Promise<YouTubeVideo | null> {
  // Title format: "Question Time | DD/MM/YYYY" — upload_date is null in flat-playlist mode
  const [yyyy, mm, dd] = date.split("-");
  const titleDate = `${dd}/${mm}/${yyyy}`; // "25/03/2026"
  const keywords = CHAMBER_KEYWORDS[chamber];

  console.log(`  Searching YouTube for ${date} ${chamber}...`);

  const { stdout } = await execFileAsync(
    "yt-dlp",
    [CHANNEL_URL, "--flat-playlist", "--dump-json", "--playlist-end", "30"],
    { timeout: 60_000 }
  );

  const hasKeyword = (v: Record<string, unknown>) => {
    const haystack = `${v.title ?? ""} ${v.description ?? ""}`;
    return keywords.some((kw) => haystack.toLowerCase().includes(kw.toLowerCase()));
  };

  for (const line of stdout.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line) as Record<string, unknown>;
      const titleStr = String(v.title ?? "");
      if (titleStr.includes(titleDate) && hasKeyword(v)) {
        console.log(`  Found YouTube video: ${v.id} — ${titleStr}`);
        return { videoId: String(v.id), title: titleStr, uploadDate: date.replace(/-/g, "") };
      }
    } catch {
      // skip malformed lines
    }
  }

  console.warn(`  No YouTube video found for ${date} (${chamber})`);
  return null;
}

export interface SubtitleEntry {
  start: number; // seconds from video start
  dur: number;
  text: string;
}

/**
 * Fetch YouTube auto-generated captions via youtube-caption-extractor.
 * Returns subtitle entries (start/dur/text) or null if unavailable.
 */
export async function downloadYouTubeCaptions(videoId: string): Promise<SubtitleEntry[] | null> {
  console.log(`  Fetching YouTube captions for ${videoId}...`);
  try {
    const subs = await getSubtitles({ videoID: videoId, lang: "en" });
    if (!subs || subs.length === 0) {
      console.warn("  No captions returned");
      return null;
    }
    console.log(`  Got ${subs.length} caption entries`);
    return subs.map((s) => ({
      start: parseFloat(s.start as unknown as string),
      dur: parseFloat(s.dur as unknown as string),
      text: s.text,
    }));
  } catch (e) {
    console.warn(`  Caption fetch failed: ${(e as Error).message?.split("\n")[0]}`);
    return null;
  }
}
