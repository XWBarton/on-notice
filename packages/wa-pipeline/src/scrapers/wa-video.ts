const BASE_URL = "https://www.parliament.wa.gov.au";

export interface WAVideoMeta {
  uuid: string;
  hlsUrl: string;
  /** Audio-only HLS playlist URL (if found in master manifest) */
  audioUrl: string;
  /** Chapter titles keyed by chapter number, if discoverable */
  chapters: Record<number, string>;
}

/**
 * Fetch a WA Parliament video page and extract the HLS m3u8 stream URL
 * from the embedded broadcasting.Player() initialisation script.
 */
export async function fetchVideoMeta(uuid: string): Promise<WAVideoMeta> {
  const url = `${BASE_URL}/watch/video/${uuid}`;
  console.log(`  Fetching video page: ${url}`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Video page fetch failed: ${res.status}`);

  const html = await res.text();

  // The player is initialised like:
  //   broadcasting.Player(el, { src: 'https://...mediamist.io/....m3u8', ... })
  const srcMatch = html.match(/broadcasting\.Player\([^,]+,\s*\{[^}]*src:\s*['"]([^'"]+\.m3u8)['"]/);
  if (!srcMatch) throw new Error(`Could not find HLS src in video page for ${uuid}`);

  const hlsUrl = srcMatch[1];
  console.log(`  HLS URL: ${hlsUrl}`);

  // Fetch master playlist to find the audio-only rendition
  let audioUrl = hlsUrl; // fallback to master if we can't find audio track
  try {
    const m3u8Res = await fetch(hlsUrl);
    if (m3u8Res.ok) {
      const m3u8 = await m3u8Res.text();
      // Look for: #EXT-X-MEDIA:TYPE=AUDIO,...,URI="..."
      const audioMatch = m3u8.match(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*URI="([^"]+)"/);
      if (audioMatch) {
        const audioPath = audioMatch[1];
        // Resolve relative URI against the m3u8 base URL
        audioUrl = audioPath.startsWith("http")
          ? audioPath
          : new URL(audioPath, hlsUrl).toString();
        console.log(`  Audio playlist: ${audioUrl}`);
      } else {
        console.log("  No separate audio rendition found — using master playlist");
      }
    }
  } catch (err) {
    console.warn("  Failed to parse master playlist (non-fatal):", err);
  }

  return { uuid, hlsUrl, audioUrl, chapters: {} };
}
