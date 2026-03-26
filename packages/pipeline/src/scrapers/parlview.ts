/**
 * ParlView scraper — discovers video ID for a given date and chamber.
 *
 * Uses Puppeteer to load the ParlView search page and intercepts the
 * API response that returns video metadata, since the site is a React SPA
 * that renders video IDs client-side only.
 */

import puppeteer from "puppeteer";

export interface ParlViewVideo {
  id: string;
  title: string;
  chamber: string;
  recordingFrom: string;
  /** SMPTE timecode of the first frame of the recording — used to calculate file offsets */
  mediaSom: string;
  /** Frame number of the HLS file's first frame (divide by 25 to get seconds-from-midnight AEDT) */
  fileSom: string;
  /** HLS m3u8 URL for this video */
  hlsUrl: string;
  segments: ParlViewSegment[];
}

export interface ParlViewSegment {
  partId: string;
  segmentTitle: string;
  /** SMPTE timecode: HH:MM:SS:FF */
  segmentIn: string;
  /** SMPTE timecode: HH:MM:SS:FF */
  segmentOut: string;
}

const CHAMBER_NAMES: Record<string, string[]> = {
  fed_hor: ["House of Representatives", "House of Representatives Chamber"],
  fed_sen: ["Senate", "Senate Chamber"],
};

/** Convert SMPTE timecode (HH:MM:SS:FF at 25fps) to seconds */
export function timecodeToSeconds(tc: string): number {
  const parts = tc.split(":").map(Number);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts;
  return h * 3600 + m * 60 + s + f / 25;
}

/** Find the recording start wall-clock time as a Date */
export function recordingStart(video: ParlViewVideo): Date {
  return new Date(video.recordingFrom);
}

/**
 * Find the Question Time segment and return start/end in seconds
 * relative to the start of the recording.
 */
export function questionTimeOffsets(
  video: ParlViewVideo
): { startSec: number; endSec: number } | null {
  const seg = video.segments.find((s) =>
    /question time/i.test(s.segmentTitle)
  );
  if (!seg) return null;

  // Segment timecodes are wall-clock SMPTE values (e.g. 14:00:22:24 = 2pm).
  // mediaSom is the wall-clock timecode at the start of the recording (e.g. 09:59:48:17).
  // File offset = segment timecode - mediaSom.
  const somSec = timecodeToSeconds(video.mediaSom);
  const startSec = timecodeToSeconds(seg.segmentIn) - somSec;
  const endSec = timecodeToSeconds(seg.segmentOut) - somSec;
  return { startSec: Math.max(0, startSec), endSec };
}

export interface ParlViewCaption {
  /** Wall-clock SMPTE timecode of caption start, e.g. "14:01:38:04" */
  In: string;
  /** Wall-clock SMPTE timecode of caption end */
  Out: string;
  Text: string;
}

/**
 * Fetch closed captions for a ParlView video from the captions API.
 * Returns the full day's captions with wall-clock SMPTE timecodes.
 * The API requires POST (GET returns 405).
 */
export async function fetchParlViewCaptions(videoId: string): Promise<ParlViewCaption[]> {
  const res = await fetch(`https://vod.uat.aph.gov.au/api/videos/captions/${videoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    console.warn(`  ParlView captions API returned ${res.status}`);
    return [];
  }
  const data = await res.json() as ParlViewCaption[];
  console.log(`  Fetched ${data.length} caption entries from ParlView captions API`);
  return Array.isArray(data) ? data : [];
}

export async function findParlViewVideo(
  date: string,
  parliamentId: "fed_hor" | "fed_sen"
): Promise<ParlViewVideo | null> {
  const chamberNames = CHAMBER_NAMES[parliamentId];
  const ddmmyyyy = date.split("-").reverse().join("/"); // 2026-03-23 → 23/03/2026

  console.log(`  Launching Puppeteer to find ParlView video for ${date} (${parliamentId})...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // Intercept API responses from vodapi
    const videos: ParlViewVideo[] = [];

    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("vodapi.aph.gov.au")) return;

      try {
        const json = await response.json();

        // Search results response
        if (json?.searchResults?.videos) {
          for (const v of json.searchResults.videos) {
            if (
              v.title === ddmmyyyy &&
              chamberNames.some((n) => v.parlViewTitle?.includes(n) || v.eventSubGroup?.includes(n))
            ) {
              videos.push({
                id: v.parlViewId ?? v.titleId,
                title: v.parlViewTitle ?? v.title,
                chamber: v.eventSubGroup ?? "",
                recordingFrom: v.recordingFrom ?? "",
                mediaSom: v.mediaSom ?? "",
                fileSom: v.files?.file?.fileSom ?? v.fileSom ?? "",
                hlsUrl: v.files?.file?.url ?? "",
                segments: Array.isArray(v.segments) ? v.segments : [],
              });
            }
          }
        }

        // Individual video detail response
        if (json?.videoDetails?.title === ddmmyyyy) {
          const v = json.videoDetails;
          if (chamberNames.some((n) => v.parlViewTitle?.includes(n) || v.eventSubGroup?.includes(n))) {
            videos.push({
              id: v.parlViewId ?? v.titleId,
              title: v.parlViewTitle ?? v.title,
              chamber: v.eventSubGroup ?? "",
              recordingFrom: v.recordingFrom ?? "",
              mediaSom: v.mediaSom ?? "",
              fileSom: v.files?.file?.fileSom ?? v.fileSom ?? "",
              hlsUrl: v.files?.file?.url ?? "",
              segments: Array.isArray(v.segments) ? v.segments : [],
            });
          }
        }
      } catch {
        // Not JSON — ignore
      }
    });

    // Build the search URL
    const chamber = parliamentId === "fed_hor" ? "House+of+Representatives" : "Senate";
    const searchUrl = `https://parlview.aph.gov.au/parlviewSearch.php?action=search&dropdown=custom&date_start=${date}&date_end=${date}&query=${chamber}+Chamber&order=date&direction=DESC&itemsPerPage=20&page=1`;

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Give React a moment to finish rendering
    await new Promise((r) => setTimeout(r, 3000));

    if (videos.length > 0) {
      // Prefer the one with segments (Question Time info)
      const withSegments = videos.find((v) => v.segments.length > 0);
      return withSegments ?? videos[0];
    }

    // Fallback: extract video IDs from page HTML via regex on the page content
    const pageContent = await page.content();
    const idMatches = [...pageContent.matchAll(/(?:video\/|videoID=)(\d{6,7})/g)];
    const videoLinks = [...new Set(idMatches.map((m) => m[1]))];

    for (const videoId of videoLinks.slice(0, 5)) {
      const res = await fetch(`https://vodapi.aph.gov.au/api/search/parlview/${videoId}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = await res.json() as any;
      const v = json?.videoDetails as Record<string, string> | null;
      if (
        v &&
        v.title === ddmmyyyy &&
        chamberNames.some((n) => (v.parlViewTitle ?? "").includes(n) || (v.eventSubGroup ?? "").includes(n))
      ) {
        return {
          id: v.parlViewId ?? v.titleId,
          title: v.parlViewTitle ?? v.title,
          chamber: v.eventSubGroup ?? "",
          recordingFrom: v.recordingFrom ?? "",
          mediaSom: v.mediaSom ?? "",
          fileSom: (v.files as unknown as Record<string, Record<string, string>> | undefined)?.file?.fileSom ?? "",
          hlsUrl: (v.files as unknown as Record<string, Record<string, string>> | undefined)?.file?.url ?? "",
          segments: Array.isArray(json.videoDetails.segments) ? json.videoDetails.segments : [],
        };
      }
    }

    console.warn(`  No ParlView video found for ${date} (${parliamentId})`);
    return null;
  } finally {
    await browser.close();
  }
}
