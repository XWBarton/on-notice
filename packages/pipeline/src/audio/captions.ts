/**
 * Downloads ParlView HLS subtitle (WebVTT) captions for the Question Time window
 * and builds a condensed transcript for AI timestamp extraction.
 *
 * VTT timestamps are local to the HLS file (seconds from fileSom).
 * We convert them to QT-relative seconds (T+0 = Question Time start) for the AI prompt.
 */

import type { ParlViewVideo } from "../scrapers/parlview";
import { timecodeToSeconds } from "../scrapers/parlview";

interface VttEntry {
  sec: number;
  text: string;
}

/**
 * Parse a merged VTT string into (timestamp_sec, text) entries, sorted by time.
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
    if (
      deduped.length &&
      Math.abs(e.sec - deduped[deduped.length - 1].sec) < 0.5 &&
      e.text === deduped[deduped.length - 1].text
    )
      continue;
    deduped.push(e);
  }

  return deduped;
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
 * Condense rolling captions to their terminal form.
 * Rolling captions increment word-by-word; skip entries that are a strict prefix
 * of the next entry (they're incomplete rolling frames).
 */
function condenseCaptions(entries: VttEntry[]): VttEntry[] {
  const result: VttEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const curr = entries[i];
    const next = entries[i + 1];
    if (next && next.text.startsWith(curr.text) && next.text.length > curr.text.length) continue;
    result.push(curr);
  }
  return result;
}

/**
 * Download and condense the QT subtitle track.
 * Returns a "T+Ns: text" transcript (seconds from QT start) suitable for AI parsing.
 */
export async function buildQtTranscript(
  video: ParlViewVideo,
  qtStartSec: number,
  qtEndSec: number
): Promise<string | null> {
  if (!video.hlsUrl || !video.fileSom) {
    console.warn("  Caption transcript: missing hlsUrl or fileSom");
    return null;
  }

  const fileSomSec = parseInt(video.fileSom, 10) / 25;
  const mediaSomSec = timecodeToSeconds(video.mediaSom);
  const vttOffset = mediaSomSec - fileSomSec;

  const qtStartLocal = qtStartSec + vttOffset;
  const qtEndLocal = qtEndSec + vttOffset;

  const hlsBase = video.hlsUrl.substring(0, video.hlsUrl.lastIndexOf("/"));
  const subtitleM3u8Url = `${hlsBase}/Video1/Subtitle/index.m3u8`;

  console.log(`  Fetching subtitle playlist: ${subtitleM3u8Url}`);
  const m3u8Res = await fetch(subtitleM3u8Url);
  if (!m3u8Res.ok) {
    console.warn(`  Caption transcript: subtitle playlist fetch failed (${m3u8Res.status})`);
    return null;
  }
  const m3u8Text = await m3u8Res.text();

  const segLines = m3u8Text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (segLines.length === 0) {
    console.warn("  Caption transcript: no segments in subtitle playlist");
    return null;
  }

  const firstSeg = segLines[0].trim();
  const segMatch = firstSeg.match(/^(.+_)(\d+)(\.vtt)$/);
  if (!segMatch) {
    console.warn(`  Caption transcript: unexpected segment name format: ${firstSeg}`);
    return null;
  }

  const extinfMatch = m3u8Text.match(/#EXTINF:([\d.]+)/);
  const segDuration = extinfMatch ? parseFloat(extinfMatch[1]) : 3.84;

  const startIdx = Math.max(0, Math.floor((qtStartLocal - 60) / segDuration));
  const endIdx = Math.ceil((qtEndLocal + 60) / segDuration);
  const segTemplate = `${segMatch[1]}{{N}}${segMatch[3]}`;
  const subtitleBaseUrl = subtitleM3u8Url.substring(0, subtitleM3u8Url.lastIndexOf("/"));

  console.log(`  Downloading subtitle segments ${startIdx}–${endIdx} (${endIdx - startIdx + 1} segs)...`);

  const vttContent = await fetchSubtitleSegments(subtitleBaseUrl, segTemplate, startIdx, endIdx);
  const allEntries = parseVtt(vttContent);

  // Filter to QT window only
  const qtEntries = allEntries.filter(
    (e) => e.sec >= qtStartLocal - 30 && e.sec <= qtEndLocal + 30
  );

  // Condense rolling captions to terminal forms
  const condensed = condenseCaptions(qtEntries);

  // Format as T+Ns relative to QT start
  const lines = condensed.map((e) => {
    const qtRelSec = Math.round(e.sec - vttOffset - qtStartSec);
    return `T+${qtRelSec}s: ${e.text}`;
  });

  console.log(`  Condensed transcript: ${condensed.length} lines (from ${allEntries.length} raw entries)`);
  return lines.join("\n");
}
