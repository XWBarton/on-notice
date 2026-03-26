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

export interface SubtitleEntry {
  start: number; // seconds from video start
  dur: number;
  text: string;
}

// InnerTube API constants — ANDROID client avoids WEB bot-detection
const INNERTUBE_API_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const ANDROID_CLIENT_VERSION = "19.35.36";
const ANDROID_SDK = 30;

/**
 * Parse a WebVTT string (with inline timing tags) into SubtitleEntry[].
 * Keeps only the "terminal" form of rolling captions and converts to seconds.
 */
function parseVttToEntries(vttText: string): SubtitleEntry[] {
  const tsPat = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->/m;
  const tagPat = /<[^>]+>/g;
  const entries: SubtitleEntry[] = [];

  for (const block of vttText.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const tsLine = lines.find((l) => l.includes("-->"));
    if (!tsLine) continue;
    const tsMatch = tsPat.exec(tsLine);
    if (!tsMatch) continue;
    const [h, m, s] = tsMatch[1].split(":").map(Number);
    const start = h * 3600 + m * 60 + s;
    const text = lines
      .filter((l) => !l.includes("-->") && !l.match(/^WEBVTT|^NOTE|^\d+$/))
      .join(" ")
      .replace(tagPat, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) entries.push({ start, dur: 0, text });
  }

  return entries;
}

/**
 * Fetch YouTube auto-generated captions via the InnerTube ANDROID client.
 *
 * Uses the ANDROID client which is less bot-restricted than the WEB client.
 * Returns subtitle entries (start/dur/text) or null if unavailable.
 */
export async function downloadYouTubeCaptions(videoId: string): Promise<SubtitleEntry[] | null> {
  console.log(`  Fetching YouTube captions for ${videoId}...`);
  try {
    const playerRes = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `com.google.android.youtube/${ANDROID_CLIENT_VERSION} (Linux; U; Android ${ANDROID_SDK}) gzip`,
          "X-YouTube-Client-Name": "3",
          "X-YouTube-Client-Version": ANDROID_CLIENT_VERSION,
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: ANDROID_CLIENT_VERSION,
              androidSdkVersion: ANDROID_SDK,
              hl: "en",
              gl: "US",
            },
          },
        }),
      }
    );

    if (!playerRes.ok) {
      console.warn(`  InnerTube player API returned ${playerRes.status}`);
      return null;
    }

    const player = (await playerRes.json()) as Record<string, unknown>;
    const tracks = (
      (player?.captions as Record<string, unknown>)
        ?.playerCaptionsTracklistRenderer as Record<string, unknown>
    )?.captionTracks as Array<Record<string, unknown>> | undefined;

    if (!tracks || tracks.length === 0) {
      console.warn("  No caption tracks in player response");
      return null;
    }

    // Prefer ASR (auto-generated) English track; fall back to any English track
    const track =
      tracks.find(
        (t) =>
          String(t.languageCode ?? "").startsWith("en") &&
          String(t.kind ?? "") === "asr"
      ) ??
      tracks.find((t) => String(t.languageCode ?? "").startsWith("en")) ??
      tracks[0];

    if (!track?.baseUrl) {
      console.warn("  No usable caption track found");
      return null;
    }

    const vttUrl = `${track.baseUrl}&fmt=vtt`;
    const vttRes = await fetch(vttUrl as string);
    if (!vttRes.ok) {
      console.warn(`  Caption VTT fetch failed (${vttRes.status})`);
      return null;
    }

    const vttText = await vttRes.text();
    if (!vttText.includes("WEBVTT")) {
      console.warn("  Caption response is not valid VTT");
      return null;
    }

    const entries = parseVttToEntries(vttText);
    console.log(`  Got ${entries.length} caption entries`);
    return entries.length > 0 ? entries : null;
  } catch (e) {
    console.warn(`  Caption fetch failed: ${(e as Error).message?.split("\n")[0]}`);
    return null;
  }
}
