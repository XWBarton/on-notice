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
 * YouTube embeds `captionTracks` JSON server-side in the page HTML — no
 * authentication required.  We fetch the public watch page with a browser
 * User-Agent, extract the ASR English track URL, and download the VTT.
 */
export async function downloadYouTubeCaptions(videoId: string): Promise<string | null> {
  console.log(`  Fetching YouTube page for caption URLs (${videoId})...`);

  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!pageRes.ok) {
    console.warn(`  YouTube page fetch failed: ${pageRes.status}`);
    return null;
  }

  const html = await pageRes.text();

  const idx = html.indexOf('"captionTracks":');
  if (idx === -1) {
    console.warn("  No captionTracks found in YouTube page HTML");
    return null;
  }

  // Extract the JSON array that follows "captionTracks":
  const arrStart = html.indexOf("[", idx);
  let depth = 0;
  let arrEnd = arrStart;
  for (let i = arrStart; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) { arrEnd = i + 1; break; }
    }
  }

  let tracks: Array<{ languageCode: string; kind?: string; baseUrl: string }>;
  try {
    tracks = JSON.parse(html.slice(arrStart, arrEnd));
  } catch {
    console.warn("  Failed to parse captionTracks JSON");
    return null;
  }

  // Prefer auto-generated English (kind=asr); fall back to any English track
  const track =
    tracks.find((t) => t.languageCode === "en" && t.kind === "asr") ??
    tracks.find((t) => t.languageCode === "en");

  if (!track?.baseUrl) {
    console.warn("  No English auto-caption track found");
    return null;
  }

  const vttRes = await fetch(`${track.baseUrl}&fmt=vtt`);
  if (!vttRes.ok) {
    console.warn(`  VTT fetch failed: ${vttRes.status}`);
    return null;
  }

  const vttContent = await vttRes.text();
  console.log(`  Downloaded ${Math.round(vttContent.length / 1024)}KB of YouTube captions`);
  return vttContent;
}
