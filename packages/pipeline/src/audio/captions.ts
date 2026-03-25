/**
 * Downloads ParlView HLS subtitle (WebVTT) captions for the Question Time window
 * and builds a filtered transcript for AI timestamp extraction.
 *
 * We only keep lines that contain Speaker announcement patterns
 * (call to member/senator/leader) plus time markers every 30s.
 * This reduces ~140K tokens of full speech content down to ~1-2K tokens.
 */

import type { ParlViewVideo } from "../scrapers/parlview";
import { timecodeToSeconds } from "../scrapers/parlview";

interface VttEntry {
  sec: number; // VTT file-local seconds
  text: string;
}

/** Lines matching Speaker announcements — "call to the member for X" */
const SPEAKER_CALL_RE =
  /\b(?:give|gave|recall|I\s+call|now\s+call|next\s+call|the\s+call)\s+(?:the\s+)?(?:call\s+to\s+)?(?:the\s+)?(?:honourable\s+(?:the\s+)?)?(?:member\s+for|senator|leader\s+of\s+the\s+opposition|deputy\s+leader|manager\s+of\s+opposition)/i;

/** Broader catch — any line mentioning "member for" or leadership roles */
const MEMBER_FOR_RE =
  /\bmember\s+for\s+[A-Z]|\bsenator\s+(?:for\s+)?[A-Z]|\bleader\s+of\s+the\s+opposition\b|\bmanager\s+of\s+opposition\b|\bdeputy\s+(?:prime\s+minister|leader)\b/i;

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
 * Keep only terminal-form rolling captions (drop incomplete rolling frames).
 * A frame is incomplete if the next entry's text starts with it.
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
 * Filter condensed entries to Speaker-call lines + 30-second time markers.
 * Reduces ~140K tokens of full speech content to ~1–2K tokens.
 */
function buildSpeakerCallTranscript(
  condensed: VttEntry[],
  vttOffset: number,
  qtStartSec: number,
  qtEndSec: number
): string {
  const lines: string[] = [];
  let lastMarkerSec = -60;
  let linesAfterCall = 0;
  const MAX_AFTER = 4; // include first few lines of each question for content matching

  for (const e of condensed) {
    const qtRelSec = Math.round(e.sec - vttOffset - qtStartSec);
    if (qtRelSec < -30 || qtRelSec > qtEndSec - qtStartSec + 30) continue;

    // Insert time marker every 30s
    if (qtRelSec - lastMarkerSec >= 30) {
      lines.push(`--- T+${Math.max(0, qtRelSec)}s ---`);
      lastMarkerSec = qtRelSec;
    }

    const isSpeakerCall = SPEAKER_CALL_RE.test(e.text) || MEMBER_FOR_RE.test(e.text);
    if (isSpeakerCall) {
      lines.push(`T+${qtRelSec}s: ${e.text}`);
      linesAfterCall = MAX_AFTER; // reset — include next N lines (question onset)
    } else if (linesAfterCall > 0) {
      lines.push(`T+${qtRelSec}s: ${e.text}`);
      linesAfterCall--;
    }
  }

  return lines.join("\n");
}

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
 * Download QT subtitles and return a Speaker-call-filtered transcript.
 * Format: time markers every 30s + "T+Ns: <caption text>" for speaker announcements only.
 * Typical output: 50–150 lines, ~1–2K tokens.
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
  const condensed = condenseCaptions(allEntries);
  const transcript = buildSpeakerCallTranscript(condensed, vttOffset, qtStartSec, qtEndSec);

  const lineCount = transcript.split("\n").filter((l) => !l.startsWith("---")).length;
  console.log(`  Speaker-call transcript: ${lineCount} lines (from ${allEntries.length} raw entries)`);

  return transcript;
}
