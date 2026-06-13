// parliament.wa.gov.au (Lotus Domino) sits behind a WAF that 403s requests
// with a missing or non-browser User-Agent — which is what Node's bare fetch
// sends. Present as a real browser so scrapes aren't intermittently blocked.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-AU,en;q=0.9",
} as const;

/** fetch() with browser-like headers, merged over any caller-supplied init. */
export function waFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...BROWSER_HEADERS, ...(init.headers ?? {}) },
  });
}
