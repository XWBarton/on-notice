/**
 * Finds the Australian Parliament Live YouTube video for a given date and chamber,
 * and downloads the auto-generated captions.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

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
 * yt-dlp appends the language code to the output filename (e.g. ID.en.vtt).
 */
export async function downloadYouTubeCaptions(
  videoId: string,
  outputDir: string
): Promise<string | null> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputTemplate = path.join(outputDir, `yt-captions-${videoId}`);

  try {
    await execFileAsync(
      "yt-dlp",
      [
        url,
        "--write-auto-sub",
        "--sub-lang", "en-orig",
        "--sub-format", "vtt",
        "--skip-download",
        "-o", outputTemplate,
      ],
      { timeout: 120_000 }
    );
  } catch (e) {
    // yt-dlp exits non-zero if no subs found but may still write a file
    console.warn(`  yt-dlp captions warning: ${(e as Error).message?.split("\n")[0] ?? ""}`);
  }

  // yt-dlp may write *.en.vtt, *.en-orig.vtt, etc.
  const vttFiles = fs
    .readdirSync(outputDir)
    .filter((f) => f.startsWith(`yt-captions-${videoId}`) && f.endsWith(".vtt"));

  if (vttFiles.length === 0) {
    console.warn("  No YouTube caption file written");
    return null;
  }

  return fs.readFileSync(path.join(outputDir, vttFiles[0]), "utf-8");
}
