/**
 * WA Parliament pipeline — scrape and download "Questions Without Notice" audio.
 *
 * Usage:
 *   ts-node src/index.ts [--chamber assembly|council]
 *
 * Defaults to Legislative Assembly.
 */

import { fetchQuestionsWithoutNotice, WAChamber } from "./scrapers/wa-gallery";
import { fetchVideoMeta } from "./scrapers/wa-video";
import { downloadHlsAudio } from "./audio/downloader";
import * as path from "path";

async function main() {
  const args = process.argv.slice(2);
  const chamberArg = args[args.indexOf("--chamber") + 1];
  const chamber: WAChamber =
    chamberArg === "council" ? "council" : "assembly";

  console.log(`\n=== WA Parliament scraper (${chamber}) ===\n`);

  // 1. Find the latest "Questions Without Notice" video
  const listings = await fetchQuestionsWithoutNotice(chamber);
  if (listings.length === 0) {
    console.error("No videos found. Parliament may not have sat recently.");
    process.exit(1);
  }

  const latest = listings[0];
  console.log(`\nLatest: "${latest.title}" (${latest.uuid})`);

  // 2. Get the HLS stream URL from the video page
  const meta = await fetchVideoMeta(latest.uuid);

  // 3. Download audio
  const outputDir = path.join(process.cwd(), "output", latest.uuid);
  const audioPath = await downloadHlsAudio(meta.hlsUrl, outputDir);

  console.log(`\nDone. Audio saved to:\n  ${audioPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
