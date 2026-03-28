/**
 * Builds a filtered transcript for AI timestamp extraction from VTT captions.
 *
 * Two entry points:
 *  - buildQtTranscript: ParlView HLS subtitle track (only covers ~4 hours from
 *    recording start — works for Monday QT at noon, fails Tue–Thu at 2pm)
 *  - buildQtTranscriptFromYouTubeCaptions: full-day YouTube auto-captions;
 *    detects the QT window by searching for "Question Time" in the captions,
 *    so it works regardless of when QT occurs.
 *
 * We only keep lines that contain Speaker announcement patterns
 * (call to member/senator/leader) plus time markers every 30s.
 * This reduces ~140K tokens of full speech content down to ~1-2K tokens.
 */

import type { ParlViewVideo, ParlViewCaption } from "../scrapers/parlview";
import { timecodeToSeconds } from "../scrapers/parlview";
import type { SubtitleEntry } from "../scrapers/youtube";

/** Pattern that identifies the formal opening of Question Time in Hansard captions */
const QT_OPEN_RE = /\bquestions?\s+(without\s+notice|to\s+ministers?|time)\b|\bquestion\s+time\b/i;

interface VttEntry {
  sec: number; // VTT file-local seconds
  text: string;
}

/** Lines matching Speaker announcements — "call to the member for X" or "call to the honourable for X" */
const SPEAKER_CALL_RE =
  /\b(?:give|gave|recall|I\s+call|now\s+call|next\s+call|the\s+call)\s+(?:the\s+)?(?:call\s+to\s+)?(?:the\s+)?(?:honourable\s+(?:the\s+)?)?(?:member\s+for|senator|leader\s+of\s+the\s+opposition|deputy\s+leader|manager\s+of\s+opposition)|\bthe\s+call\s+to\s+the\s+honourable\s+for\s+[A-Z]/i;

/** Broader catch — any line mentioning "member for" or leadership roles */
const MEMBER_FOR_RE =
  /\bmember\s+for\s+[A-Z]|\bsenator\s+(?:for\s+)?[A-Z]|\bleader\s+of\s+the\s+opposition\b|\bmanager\s+of\s+opposition\b|\bdeputy\s+(?:prime\s+minister|leader)\b/i;

/**
 * Patterns that indicate a line is a response/speech, not a Speaker call.
 * Used to exclude false-positive MEMBER_FOR_RE matches from minister responses
 * or speech content that happens to mention a member.
 *
 * Rolling captions may prepend a fragment: "Minister. I thank the member for Calare"
 * so we match "I thank" both at line start and after a sentence boundary (. ! ?).
 */
const RESPONSE_CONTEXT_RE =
  /(?:^|[.!?]\s+)I\s+(?:thank|acknowledge|welcome|appreciate|commend|congratulate|understand|would|want|think|also|note|refer|say|can)\b|^Senator\s+\w+,/i;

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
 * Filter condensed entries to Speaker-call lines + surrounding context + 30-second time markers.
 * Includes lines before each speaker call (tail of minister's answer) and after (question opener).
 * Reduces ~140K tokens of full speech content to ~2–4K tokens.
 */
function buildSpeakerCallTranscript(
  condensed: VttEntry[],
  vttOffset: number,
  qtStartSec: number,
  qtEndSec: number
): string {
  const qtDuration = qtEndSec - qtStartSec;
  const MAX_BEFORE = 6; // lines before each speaker call (tail of minister's answer)
  const MAX_AFTER = 4;  // lines after each speaker call (question opener)

  // Pass 1: find indices of all speaker calls and question openers within the QT window
  const anchorIndices = new Set<number>();
  for (let i = 0; i < condensed.length; i++) {
    const qtRelSec = Math.round(condensed[i].sec - vttOffset - qtStartSec);
    if (qtRelSec < -30 || qtRelSec > qtDuration + 30) continue;
    const isSpeakerCall = SPEAKER_CALL_RE.test(condensed[i].text) ||
      (MEMBER_FOR_RE.test(condensed[i].text) && !RESPONSE_CONTEXT_RE.test(condensed[i].text));
    const isQuestionOpener = /\bmy\s+question\s+is\s+to\s+the\b/i.test(condensed[i].text);
    if (isSpeakerCall || isQuestionOpener) anchorIndices.add(i);
  }

  // Pass 2: build include set — surrounding window around each anchor
  const includeSet = new Set<number>();
  // Always include the full opening window for Q1 matching
  for (let i = 0; i < condensed.length; i++) {
    const qtRelSec = Math.round(condensed[i].sec - vttOffset - qtStartSec);
    if (qtRelSec >= -30 && qtRelSec <= 300) includeSet.add(i);
  }
  for (const ci of anchorIndices) {
    for (let j = Math.max(0, ci - MAX_BEFORE); j <= Math.min(condensed.length - 1, ci + MAX_AFTER); j++) {
      includeSet.add(j);
    }
  }

  // Pass 3: emit included entries with time markers
  const lines: string[] = [];
  let lastMarkerSec = -60;
  let prevIncluded = false;

  for (let i = 0; i < condensed.length; i++) {
    const e = condensed[i];
    const qtRelSec = Math.round(e.sec - vttOffset - qtStartSec);
    if (qtRelSec < -30 || qtRelSec > qtDuration + 30) continue;

    // Insert time marker every 30s
    if (qtRelSec - lastMarkerSec >= 30) {
      lines.push(`--- T+${Math.max(0, qtRelSec)}s ---`);
      lastMarkerSec = qtRelSec;
    }

    if (includeSet.has(i)) {
      if (!prevIncluded && lines.length > 0 && !lines[lines.length - 1].startsWith("---")) {
        lines.push("...");
      }
      lines.push(`T+${qtRelSec}s: ${e.text}`);
      prevIncluded = true;
    } else {
      prevIncluded = false;
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
  // vttOffset converts VTT local timestamps (0-based from recording start) to mediaSom-relative time.
  // VTT local time = mediaSom-relative time - vttOffset  →  mediaSom-relative = VTT local + vttOffset
  // Equivalently: QT in VTT local time = qtStartSec - (-vttOffset) = qtStartSec + vttOffset = qtStartLocal
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
  const totalSegments = segLines.length;
  const vttDurationSec = totalSegments * segDuration;

  const startIdx = Math.max(0, Math.floor((qtStartLocal - 60) / segDuration));
  const endIdx = Math.min(totalSegments - 1, Math.ceil((qtEndLocal + 60) / segDuration));

  if (startIdx >= totalSegments) {
    console.warn(`  Caption transcript: QT window (${Math.round(qtStartLocal)}s–${Math.round(qtEndLocal)}s) is beyond the subtitle stream (${Math.round(vttDurationSec)}s). No subtitles for QT.`);
    return null;
  }

  const segTemplate = `${segMatch[1]}{{N}}${segMatch[3]}`;
  const subtitleBaseUrl = subtitleM3u8Url.substring(0, subtitleM3u8Url.lastIndexOf("/"));

  console.log(`  Downloading subtitle segments ${startIdx}–${endIdx} (${endIdx - startIdx + 1} segs, total ${totalSegments})...`);

  const vttContent = await fetchSubtitleSegments(subtitleBaseUrl, segTemplate, startIdx, endIdx);
  const allEntries = parseVtt(vttContent);
  const condensed = condenseCaptions(allEntries);
  const transcript = buildSpeakerCallTranscript(condensed, vttOffset, qtStartSec, qtEndSec);

  const lineCount = transcript.split("\n").filter((l) => !l.startsWith("---")).length;
  console.log(`  Speaker-call transcript: ${lineCount} lines (from ${allEntries.length} raw entries)`);

  return transcript;
}

/**
 * Build a QT transcript from YouTube auto-captions.
 *
 * The @AUSParliamentLive YouTube videos are already cut to just Question Time
 * (they start at QT start, T=0), so no QT-window detection is needed.
 *
 * Returns the filtered transcript string, or null if no speaker-call lines found.
 */
export function buildQtTranscriptFromYouTubeCaptions(
  subtitles: SubtitleEntry[],
  qtDurationSec: number
): string | null {
  const allEntries: VttEntry[] = subtitles.map((s) => ({ sec: s.start, text: s.text }));
  const condensed = condenseCaptions(allEntries);

  // vttOffset=0, qtStartSec=0 — video starts at QT start
  const transcript = buildSpeakerCallTranscript(condensed, 0, 0, qtDurationSec);

  const lineCount = transcript.split("\n").filter((l) => !l.startsWith("---")).length;
  console.log(`  YouTube speaker-call transcript: ${lineCount} lines (from ${allEntries.length} raw entries)`);

  if (lineCount === 0) {
    console.warn("  YouTube captions: no speaker-call lines found");
    return null;
  }

  return transcript;
}

/**
 * Build a QT transcript from the ParlView closed-captions API.
 *
 * The API returns wall-clock SMPTE timecodes for the full day. We filter to
 * the QT window using the segment timecodes, then convert to QT-relative seconds
 * (T+0 = QT start) and apply the same speaker-call filtering.
 *
 * @param captions     Array from fetchParlViewCaptions()
 * @param qtSegmentIn  SMPTE timecode of QT start, e.g. "14:01:02:14"
 * @param qtSegmentOut SMPTE timecode of QT end,   e.g. "15:10:15:24"
 */
export function buildQtTranscriptFromParlViewCaptions(
  captions: ParlViewCaption[],
  qtSegmentIn: string,
  qtSegmentOut: string
): string | null {
  const qtStartSec = timecodeToSeconds(qtSegmentIn);
  const qtEndSec   = timecodeToSeconds(qtSegmentOut);
  const qtDuration = qtEndSec - qtStartSec;

  // Convert to VttEntry[] with QT-relative timestamps
  const rawEntries: VttEntry[] = captions
    .map((c) => ({
      sec: timecodeToSeconds(c.In) - qtStartSec,
      text: c.Text.replace(/\s+/g, " ").trim(),
    }))
    .filter((e) => e.sec >= -30 && e.sec <= qtDuration + 30 && e.text.length > 0);

  // ParlView closed captions split speaker calls across consecutive entries on line boundaries.
  // Examples:
  //   "country. The call to the honourable" + "for Calare. To the Prime Minister,"
  //   "Award workers are as well. Give a"  + "call to the honourable member for" + "Barker."
  // We do multiple merge passes until stable, merging when an entry ends mid-call.
  let merging = true;
  let mergedEntries = rawEntries.slice();
  while (merging) {
    merging = false;
    const pass: VttEntry[] = [];
    for (let i = 0; i < mergedEntries.length; i++) {
      const curr = mergedEntries[i];
      const next = mergedEntries[i + 1];
      if (next && (
        // "...call to the honourable" + "for X..." or "...call to the honourable member for" + "Barker..."
        /\b(?:call\s+to\s+the\s+(?:honourable|member)|give\s+(?:a\s+)?(?:the\s+)?call)\s*$/i.test(curr.text) ||
        // "...member for" or "...honourable for" at end — electorate is in next entry
        /\b(?:member|honourable)\s+for\s*$/i.test(curr.text)
      )) {
        pass.push({ sec: curr.sec, text: `${curr.text} ${next.text}` });
        i++;
        merging = true; // merged something — do another pass in case we need 3-way merge
      } else {
        pass.push(curr);
      }
    }
    mergedEntries = pass;
  }
  const allEntries = mergedEntries;

  const condensed = condenseCaptions(allEntries);
  // vttOffset=0, qtStartSec=0 — entries are already QT-relative
  const transcript = buildSpeakerCallTranscript(condensed, 0, 0, qtDuration);

  const lineCount = transcript.split("\n").filter((l) => !l.startsWith("---")).length;
  console.log(`  ParlView captions transcript: ${lineCount} speaker-call lines (from ${allEntries.length} QT entries)`);

  if (lineCount === 0) {
    console.warn("  ParlView captions: no speaker-call lines found in QT window");
    return null;
  }

  return transcript;
}
