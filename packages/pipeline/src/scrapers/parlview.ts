/**
 * ParlView scraper — discovers video ID for a given date and chamber.
 *
 * Uses Puppeteer to load the ParlView search page and intercepts the
 * API response that returns video metadata, since the site is a React SPA
 * that renders video IDs client-side only.
 */


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

export interface ParlViewChunk {
  chunkId: number;
  /** Direct HLS m3u8 URL for this chunk */
  proxyUrl: string;
  /** Wall-clock SMPTE timecode of chunk start e.g. "12:50:00:00" */
  fileSom: string;
  /** Wall-clock SMPTE timecode of chunk end e.g. "16:49:59:24" */
  fileEom: string;
}

/**
 * Fetch all HLS chunks for a ParlView video.
 * The recording is split into 3 chunks of ~4 hours each.
 * Returns chunks sorted by chunkId (ascending).
 */
export async function fetchEventChunks(videoId: string): Promise<ParlViewChunk[]> {
  const res = await fetch(`https://vod.uat.aph.gov.au/api/videos/eventvideos/${videoId}`);
  if (!res.ok) {
    console.warn(`  fetchEventChunks: API returned ${res.status}`);
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as { Chunks?: any[] };
  const data = json.Chunks;
  if (!Array.isArray(data)) return [];
  const chunks: ParlViewChunk[] = data
    .filter((c) => c.ProxyUrl && c.FileSom && c.FileEom)
    .map((c) => ({
      chunkId: Number(c.ChunkId ?? 0),
      proxyUrl: String(c.ProxyUrl),
      fileSom: String(c.FileSom),
      fileEom: String(c.FileEom),
    }));
  chunks.sort((a, b) => a.chunkId - b.chunkId);
  console.log(`  fetchEventChunks: ${chunks.length} chunks — ${chunks.map(c => `chunk${c.chunkId}(${c.fileSom}–${c.fileEom})`).join(", ")}`);
  return chunks;
}

/**
 * Find the chunk whose wall-clock window contains the given SMPTE timecode.
 */
export function findChunkForTimecode(chunks: ParlViewChunk[], timecode: string): ParlViewChunk | null {
  const tc = timecodeToSeconds(timecode);
  return chunks.find(
    (c) => tc >= timecodeToSeconds(c.fileSom) && tc <= timecodeToSeconds(c.fileEom)
  ) ?? null;
}

export async function findParlViewVideo(
  date: string,
  parliamentId: "fed_hor" | "fed_sen"
): Promise<ParlViewVideo | null> {
  const chamberNames = CHAMBER_NAMES[parliamentId];
  const ddmmyyyy = date.split("-").reverse().join("/"); // 2026-03-24 → 24/03/2026
  const searchString = parliamentId === "fed_hor" ? "House of Representatives Chamber" : "Senate Chamber";

  // vodapi requires ISO datetime format and a Referer from parlview.aph.gov.au
  const params = new URLSearchParams({
    pageSize: "20",
    page: "0",
    doSearchCaptions: "false",
    withClosedCaptionData: "false",
    searchString,
    captionSearchString: "",
    fromDate: `${date}T00:00:00`,
    toDate: `${date}T23:59:59`,
  });
  const searchUrl = `https://vodapi.aph.gov.au/api/search?${params}`;
  console.log(`  Searching ParlView for ${date} (${parliamentId})...`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    const res = await fetch(searchUrl, { headers: { Referer: "https://parlview.aph.gov.au/" } });
    if (!res.ok) {
      console.warn(`  vodapi search returned ${res.status}`);
      return null;
    }
    json = await res.json();
  } catch (e) {
    console.warn(`  vodapi search failed: ${e}`);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos: any[] = json?.searchResults?.videos ?? [];
  console.log(`  vodapi returned ${videos.length} video(s)`);

  const match = videos.find((v) =>
    v.title === ddmmyyyy &&
    chamberNames.some((n: string) => v.parlViewTitle?.includes(n) || v.eventSubGroup?.includes(n))
  );

  if (!match) {
    console.warn(`  No ParlView video found for ${date} (${parliamentId})`);
    return null;
  }

  const video: ParlViewVideo = {
    id: match.parlViewId ?? match.titleId,
    title: match.parlViewTitle ?? match.title,
    chamber: match.eventSubGroup ?? "",
    recordingFrom: match.recordingFrom ?? "",
    mediaSom: match.mediaSom ?? "",
    fileSom: match.files?.file?.fileSom ?? match.fileSom ?? "",
    hlsUrl: match.files?.file?.url ?? "",
    segments: Array.isArray(match.segments) ? match.segments : [],
  };

  // If the search result didn't include segments, fetch the full detail record
  if (video.segments.length === 0) {
    try {
      const detailRes = await fetch(`https://vodapi.aph.gov.au/api/search/parlview/${video.id}`, {
        headers: { Referer: "https://parlview.aph.gov.au/" },
      });
      if (detailRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = await detailRes.json() as any;
        const v = detail?.videoDetails;
        if (v) {
          video.segments = Array.isArray(v.segments) ? v.segments : [];
          video.fileSom = v.files?.file?.fileSom ?? v.fileSom ?? video.fileSom;
          video.hlsUrl = v.files?.file?.url ?? video.hlsUrl;
          video.mediaSom = v.mediaSom ?? video.mediaSom;
        }
      }
    } catch {
      // segments are optional — continue without them
    }
  }

  console.log(`  Found: ${video.id} "${video.title}" (${video.segments.length} segments)`);
  return video;
}
