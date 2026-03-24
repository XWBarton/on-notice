/**
 * Extracts per-question start timestamps from ParlView HLS subtitle (WebVTT) captions.
 *
 * The Speaker announces each question with a phrase like:
 *   "Give a call to the honourable the Leader of the Opposition."
 *   "Call to the honourable member for McEwen."
 *   "Recall to the honourable member for Whitlam."
 *
 * VTT timestamps are local to the HLS file (seconds from fileSom).
 * We convert them to seconds from the recording start (mediaSom) so they can be
 * used as offsets into the downloaded audio file.
 */

import type { ParlViewVideo } from "../scrapers/parlview";
import { timecodeToSeconds } from "../scrapers/parlview";

const QUESTIONER_RE = /(?:give\s+(?:a\s+|the\s+)?call|recall|the\s+call|give\s+me\s+a\s+call|\bcall)\s+to\s+the\s+(?:honourable\s+(?:the\s+)?)?(?:member\s+for\b|leader\s+of\s+the\s+opposition|deputy\s+leader|manager\s+of\s+opposition)/i;
const ANSWERER_RE = /\bcall\s+to\s+the\s+(?:prime\s+minister|treasurer|minister\s+for|deputy\s+prime\s+minister|assistant\s+treasurer)/i;

interface VttEntry {
  sec: number;
  text: string;
}

/**
 * Parse a merged VTT string into (timestamp_sec, text) entries, sorted by time.
 * Timestamps are local to the HLS file (seconds from fileSom).
 */
function parseVtt(vttContent: string): VttEntry[] {
  const tsPat = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->/m;
  const tagPat = /<[^>]+>/g;
  const entries: VttEntry[] = [];

  for (const block of vttContent.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const tsMatch = tsPat.exec(lines[0]);
    if (!tsMatch) continue;
    const [h, m, s] = tsMatch[1].split(":").map(Number);
    const sec = h * 3600 + m * 60 + s;
    const text = lines
      .slice(1)
      .join(" ")
      .replace(tagPat, "")
      .replace(/\s+/g, " ")
      .trim();
    entries.push({ sec, text });
  }

  entries.sort((a, b) => a.sec - b.sec);

  // Deduplicate consecutive identical texts within 0.5s
  const deduped: VttEntry[] = [];
  for (const e of entries) {
    if (deduped.length && Math.abs(e.sec - deduped[deduped.length - 1].sec) < 0.5 && e.text === deduped[deduped.length - 1].text) continue;
    deduped.push(e);
  }

  return deduped;
}

/**
 * Find "call to questioner" timestamps in a sorted+deduped entry list.
 * Returns file-relative seconds (from recording start / mediaSom).
 *
 * @param entries        Sorted, deduped VTT entries (sec = seconds from fileSom)
 * @param fileSomSec     Seconds from midnight for the HLS file start
 * @param mediaSomSec    Seconds from midnight for mediaSom (recording start)
 * @param qtStartLocal   QT start in VTT local seconds (to filter out pre-QT matches)
 */
function findQuestionStarts(
  entries: VttEntry[],
  fileSomSec: number,
  mediaSomSec: number,
  qtStartLocal: number
): number[] {
  const vttOffset = mediaSomSec - fileSomSec; // VTT local sec → recording-relative sec: subtract this

  const results: number[] = [];
  let lastSec = -999;
  let j = 0;

  for (let i = 0; i < entries.length; i++) {
    const { sec } = entries[i];
    if (sec < qtStartLocal - 30) continue;

    // Build a 6-second forward window
    while (j < entries.length && entries[j].sec < sec + 6) j++;
    const windowText = entries
      .slice(i, j)
      .map((e) => e.text)
      .join(" ");

    if (QUESTIONER_RE.test(windowText) && !ANSWERER_RE.test(windowText)) {
      if (sec - lastSec > 60) {
        lastSec = sec;
        const recordingRelative = sec - vttOffset;
        results.push(recordingRelative);
      }
    }
  }

  return results;
}

/**
 * Download QT subtitle segments in parallel batches.
 */
async function fetchSubtitleSegments(
  subtitleBaseUrl: string,
  segmentTemplate: string,
  startIdx: number,
  endIdx: number
): Promise<string> {
  const BATCH = 50;
  const parts: string[] = [];

  for (let i = startIdx; i <= endIdx; i += BATCH) {
    const batch = Array.from(
      { length: Math.min(BATCH, endIdx - i + 1) },
      (_, k) => i + k
    );
    const results = await Promise.all(
      batch.map(async (n) => {
        try {
          const url = `${subtitleBaseUrl}/${segmentTemplate.replace("{{N}}", String(n))}`;
          const res = await fetch(url);
          if (!res.ok) return "";
          return await res.text();
        } catch {
          return "";
        }
      })
    );
    parts.push(...results);
  }

  return parts.join("\n\n");
}

/**
 * Main entry point.
 * Returns recording-relative timestamps (seconds from mediaSom) for each question start.
 * These can be used directly as segment start times in the audio editor.
 *
 * @param video          ParlView video metadata
 * @param qtStartSec     QT start in recording-relative seconds (from questionTimeOffsets)
 * @param qtEndSec       QT end in recording-relative seconds
 * @param downloadStartSec  Where the downloaded audio file starts (recording-relative)
 */
export async function extractQuestionTimestamps(
  video: ParlViewVideo,
  qtStartSec: number,
  qtEndSec: number
): Promise<number[]> {
  if (!video.hlsUrl || !video.fileSom) {
    console.warn("  Caption extraction: missing hlsUrl or fileSom");
    return [];
  }

  const fileSomSec = parseInt(video.fileSom, 10) / 25;
  const mediaSomSec = timecodeToSeconds(video.mediaSom);
  const vttOffset = mediaSomSec - fileSomSec;

  // Convert QT recording-relative offsets to VTT local seconds
  const qtStartLocal = qtStartSec + vttOffset;
  const qtEndLocal = qtEndSec + vttOffset;

  // Derive subtitle base URL from HLS URL
  const hlsBase = video.hlsUrl.substring(0, video.hlsUrl.lastIndexOf("/"));
  const subtitleM3u8Url = `${hlsBase}/Video1/Subtitle/index.m3u8`;

  console.log(`  Fetching subtitle playlist: ${subtitleM3u8Url}`);
  const m3u8Res = await fetch(subtitleM3u8Url);
  if (!m3u8Res.ok) {
    console.warn(`  Caption extraction: subtitle playlist fetch failed (${m3u8Res.status})`);
    return [];
  }
  const m3u8Text = await m3u8Res.text();

  // Parse segment template and duration from the m3u8
  const segLines = m3u8Text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (segLines.length === 0) {
    console.warn("  Caption extraction: no segments in subtitle playlist");
    return [];
  }

  const firstSeg = segLines[0].trim(); // e.g. segment_1774219759_0.vtt
  const segMatch = firstSeg.match(/^(.+_)(\d+)(\.vtt)$/);
  if (!segMatch) {
    console.warn(`  Caption extraction: unexpected segment name format: ${firstSeg}`);
    return [];
  }
  const segPrefix = segMatch[1]; // "segment_1774219759_"
  const segSuffix = segMatch[3]; // ".vtt"

  // Parse approximate segment duration from #EXTINF lines
  const extinfMatch = m3u8Text.match(/#EXTINF:([\d.]+)/);
  const segDuration = extinfMatch ? parseFloat(extinfMatch[1]) : 3.84;

  // Calculate which segment indices cover the QT window (with 60s buffer)
  const startIdx = Math.max(0, Math.floor((qtStartLocal - 60) / segDuration));
  const endIdx = Math.ceil((qtEndLocal + 60) / segDuration);
  const segTemplate = `${segPrefix}{{N}}${segSuffix}`;
  const subtitleBaseUrl = subtitleM3u8Url.substring(0, subtitleM3u8Url.lastIndexOf("/"));

  console.log(`  Downloading subtitle segments ${startIdx}–${endIdx} (${endIdx - startIdx + 1} segs)...`);

  const vttContent = await fetchSubtitleSegments(subtitleBaseUrl, segTemplate, startIdx, endIdx);
  const entries = parseVtt(vttContent);

  console.log(`  Parsed ${entries.length} VTT entries`);

  const timestamps = findQuestionStarts(entries, fileSomSec, mediaSomSec, qtStartLocal);
  console.log(`  Found ${timestamps.length} question starts: ${timestamps.map((s) => `${Math.floor(s / 60)}m${Math.round(s % 60)}s`).join(", ")}`);

  return timestamps;
}
