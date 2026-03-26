/**
 * Finds the Australian Parliament Live YouTube video for a given date and chamber,
 * and downloads the auto-generated captions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

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

/**
 * Download YouTube auto-generated captions as a VTT string.
 *
 * Uses yt-dlp --dump-json to get the video metadata (including caption CDN
 * URLs), then fetches the VTT directly. This avoids --write-auto-sub which
 * can fail in environments without a JS runtime for YouTube's n-challenge.
 */
export async function downloadYouTubeCaptions(videoId: string): Promise<string | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "yt-dlp",
      [url, "--dump-json", "--skip-download"],
      { timeout: 60_000 }
    ));
  } catch (e) {
    console.warn(`  yt-dlp info fetch failed: ${(e as Error).message ?? ""}`);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let info: any;
  try {
    info = JSON.parse(stdout);
  } catch {
    console.warn("  yt-dlp output is not valid JSON");
    return null;
  }

  // Prefer en-orig (original audio auto-captions); fall back to en
  const caps =
    (info?.automatic_captions?.["en-orig"] as Array<{ ext: string; url: string }> | undefined) ??
    (info?.automatic_captions?.["en"] as Array<{ ext: string; url: string }> | undefined);

  if (!caps) {
    console.warn("  No English automatic captions found in video info");
    return null;
  }

  const vttEntry = caps.find((c) => c.ext === "vtt");
  if (!vttEntry?.url) {
    console.warn("  No VTT entry in automatic captions");
    return null;
  }

  console.log("  Downloading YouTube VTT captions directly...");
  const res = await fetch(vttEntry.url);
  if (!res.ok) {
    console.warn(`  VTT fetch failed: ${res.status}`);
    return null;
  }

  const vttContent = await res.text();
  console.log(`  Downloaded ${Math.round(vttContent.length / 1024)}KB of captions`);
  return vttContent;
}
