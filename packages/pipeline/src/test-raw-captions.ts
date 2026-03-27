/**
 * Search raw captions for specific text patterns.
 * Usage: cd packages/pipeline && env $(cat .env | xargs) npx ts-node src/test-raw-captions.ts
 */

async function main() {
  const { findParlViewVideo, questionTimeOffsets, timecodeToSeconds } = await import("./scrapers/parlview");
  const video = await findParlViewVideo("2026-03-26", "fed_hor");
  if (!video) { console.error("No video"); process.exit(1); }

  const qtOffsets = questionTimeOffsets(video);
  if (!qtOffsets) { console.error("No QT"); process.exit(1); }

  const fileSomSec = parseInt(video.fileSom, 10) / 25;
  const mediaSomSec = timecodeToSeconds(video.mediaSom);
  const vttOffset = mediaSomSec - fileSomSec;
  const qtStartSec = qtOffsets.startSec;
  const qtEndSec = qtOffsets.endSec;
  const qtStartLocal = qtStartSec + vttOffset;
  const qtEndLocal = qtEndSec + vttOffset;

  console.log(`QT: ${qtStartSec}s → ${qtEndSec}s, vttOffset: ${vttOffset}`);
  console.log(`Local: ${qtStartLocal}s → ${qtEndLocal}s`);

  const hlsBase = video.hlsUrl!.substring(0, video.hlsUrl!.lastIndexOf("/"));
  const subtitleM3u8Url = `${hlsBase}/Video1/Subtitle/index.m3u8`;
  const m3u8Res = await fetch(subtitleM3u8Url);
  const m3u8Text = await m3u8Res.text();
  const segLines = m3u8Text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const firstSeg = segLines[0].trim();
  const segMatch = firstSeg.match(/^(.+_)(\d+)(\.vtt)$/);
  if (!segMatch) { console.error("bad seg"); return; }

  const extinfMatch = m3u8Text.match(/#EXTINF:([\d.]+)/);
  const segDuration = extinfMatch ? parseFloat(extinfMatch[1]) : 3.84;
  const totalSegments = segLines.length;
  const segTemplate = `${segMatch[1]}{{N}}${segMatch[3]}`;
  const subtitleBaseUrl = subtitleM3u8Url.substring(0, subtitleM3u8Url.lastIndexOf("/"));

  // Fetch T+2350 to T+2600 range
  const rangeStart = qtStartSec + 2100;
  const rangeEnd = qtStartSec + 2600;
  const startIdx = Math.max(0, Math.floor((rangeStart + vttOffset - 30) / segDuration));
  const endIdx = Math.min(totalSegments - 1, Math.ceil((rangeEnd + vttOffset + 30) / segDuration));

  console.log(`\nFetching segments ${startIdx}–${endIdx} for T+2350–2600s...`);

  const parts: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const url = `${subtitleBaseUrl}/${segTemplate.replace("{{N}}", String(i))}`;
    try {
      const r = await fetch(url);
      if (r.ok) parts.push(await r.text());
    } catch {}
  }
  const vttContent = parts.join("\n\n");

  const tsPat = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->/m;
  const tagPat = /<[^>]+>/g;
  const entries: { sec: number; qtRelSec: number; text: string }[] = [];

  for (const block of vttContent.split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;
    const tsMatch = tsPat.exec(lines[0]);
    if (!tsMatch) continue;
    const [h, m, s] = tsMatch[1].split(":").map(Number);
    const sec = h * 3600 + m * 60 + s;
    const qtRelSec = Math.round(sec - vttOffset - qtStartSec);
    const text = lines.slice(1).join(" ").replace(tagPat, "").replace(/\s+/g, " ").trim();
    if (text) entries.push({ sec, qtRelSec, text });
  }

  entries.sort((a, b) => a.sec - b.sec);

  // Deduplicate
  const deduped: typeof entries = [];
  for (const e of entries) {
    if (deduped.length &&
      Math.abs(e.sec - deduped[deduped.length-1].sec) < 0.5 &&
      e.text === deduped[deduped.length-1].text) continue;
    deduped.push(e);
  }

  // Condense
  const condensed: typeof entries = [];
  for (let i = 0; i < deduped.length; i++) {
    const curr = deduped[i];
    const next = deduped[i + 1];
    if (next && next.text.startsWith(curr.text) && next.text.length > curr.text.length) continue;
    condensed.push(curr);
  }

  console.log(`${condensed.length} condensed entries. Showing all:\n`);
  for (const e of condensed) {
    if (e.qtRelSec >= 2100 && e.qtRelSec <= 2600) {
      console.log(`T+${e.qtRelSec}s: ${e.text}`);
    }
  }

  // Search for key phrases
  const searches = ["My question", "Prime Minister", "throttled", "Great Western", "communities", "Calare"];
  console.log("\n--- Keyword search ---");
  for (const term of searches) {
    const matches = condensed.filter(e => e.text.toLowerCase().includes(term.toLowerCase()) && e.qtRelSec >= 2100 && e.qtRelSec <= 2700);
    if (matches.length) {
      console.log(`\n"${term}" (${matches.length} in T+2300-2700):`);
      matches.forEach(e => console.log(`  T+${e.qtRelSec}s: ${e.text}`));
    } else {
      console.log(`\n"${term}": not found in T+2300-2700`);
    }
  }
}

main().catch(console.error);
