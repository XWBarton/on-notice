const BASE_URL = "https://www.parliament.wa.gov.au";

export interface WAVideoMeta {
  uuid: string;
  hlsUrl: string;
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

  return { uuid, hlsUrl, chapters: {} };
}
