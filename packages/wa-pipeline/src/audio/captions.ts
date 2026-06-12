/**
 * Downloads and merges the WebVTT subtitle track of a WA Parliament HLS
 * chapter stream into a transcript for AI question timestamping.
 *
 * The chapter streams are already trimmed to Questions Without Notice
 * (~35–50 min), so unlike the federal pipeline we can hand the AI the whole
 * condensed transcript rather than filtering to Speaker-call lines.
 */

export interface VttEntry {
  /** Seconds relative to the start of the chapter stream (= the MP3 we download) */
  sec: number;
  text: string;
}

/** Parse the chapter start offset from a stream URL like .../ch_872_2920.m3u8 */
export function chapterOffsetSec(hlsUrl: string): number {
  const m = hlsUrl.match(/ch_(\d+)_\d+\.m3u8/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Fetch the subtitle playlist referenced by the master manifest and download
 * every VTT segment. Returns condensed entries with chapter-relative seconds.
 */
export async function fetchChapterCaptions(masterUrl: string): Promise<VttEntry[]> {
  const masterRes = await fetch(masterUrl);
  if (!masterRes.ok) throw new Error(`Master playlist fetch failed: ${masterRes.status}`);
  const master = await masterRes.text();

  const subsMatch = master.match(/#EXT-X-MEDIA:TYPE=SUBTITLES[^\n]*URI="([^"]+)"/);
  if (!subsMatch) throw new Error("No subtitle track in master playlist");
  const subsUrl = new URL(subsMatch[1], masterUrl).toString();

  const subsRes = await fetch(subsUrl);
  if (!subsRes.ok) throw new Error(`Subtitle playlist fetch failed: ${subsRes.status}`);
  const segNames = (await subsRes.text())
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  console.log(`  Downloading ${segNames.length} caption segments...`);
  const offset = chapterOffsetSec(masterUrl);
  const entries: VttEntry[] = [];

  // Fetch with modest concurrency; a missing segment is non-fatal.
  const CONCURRENCY = 12;
  for (let i = 0; i < segNames.length; i += CONCURRENCY) {
    const batch = segNames.slice(i, i + CONCURRENCY);
    const texts = await Promise.all(
      batch.map(async (name) => {
        try {
          const res = await fetch(new URL(name, subsUrl).toString());
          return res.ok ? await res.text() : "";
        } catch {
          return "";
        }
      })
    );
    for (const vtt of texts) entries.push(...parseVtt(vtt, offset));
  }

  entries.sort((a, b) => a.sec - b.sec);
  return condense(entries);
}

function parseVtt(vttContent: string, offsetSec: number): VttEntry[] {
  const tsPat = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->/m;
  const entries: VttEntry[] = [];
  for (const block of vttContent.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    // Cue id line is optional; the timestamp may be on line 0 or 1
    const tsLineIdx = tsPat.test(lines[0]) ? 0 : tsPat.test(lines[1] ?? "") ? 1 : -1;
    if (tsLineIdx === -1) continue;
    const tsMatch = tsPat.exec(lines[tsLineIdx])!;
    const [h, m, s] = tsMatch[1].split(":").map(Number);
    const text = lines
      .slice(tsLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    entries.push({ sec: h * 3600 + m * 60 + s - offsetSec, text });
  }
  return entries;
}

/**
 * Collapse rolling captions: drop entries that are a prefix of the next entry
 * (incomplete rolling frames) and exact repeats.
 */
function condense(entries: VttEntry[]): VttEntry[] {
  const result: VttEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const curr = entries[i];
    const next = entries[i + 1];
    if (next && next.text.startsWith(curr.text) && next.text.length > curr.text.length) continue;
    if (result.length && result[result.length - 1].text === curr.text) continue;
    result.push(curr);
  }
  return result;
}

/** Render entries as "[mm:ss] text" lines for the AI prompt. */
export function renderTranscript(entries: VttEntry[]): string {
  return entries
    .filter((e) => e.sec >= 0)
    .map((e) => {
      const mm = Math.floor(e.sec / 60);
      const ss = Math.floor(e.sec % 60);
      return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${e.text}`;
    })
    .join("\n");
}
