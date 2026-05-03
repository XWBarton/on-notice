/**
 * ParlInfo scraper — fetches Explanatory Memoranda from parlinfo.aph.gov.au.
 *
 * ParlInfo is behind Azure WAF. We bypass it by:
 *   1. Visiting the homepage first to establish a legitimate session (WAF cookie warm-up).
 *   2. Spoofing navigator.webdriver so the JS challenge sees a real browser.
 *
 * A single browser context is shared across all bills in a pipeline run.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";

let browser: Browser | null = null;
let sharedContext: BrowserContext | null = null;

async function getBrowserContext(): Promise<BrowserContext> {
  if (browser && sharedContext) return sharedContext;

  browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  sharedContext = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-AU",
    extraHTTPHeaders: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
    },
  });

  // Hide the automation flag that WAF fingerprints
  await sharedContext.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // Warm-up visit so WAF session cookies are set before any search request
  const warmPage = await sharedContext.newPage();
  try {
    await warmPage.goto("https://parlinfo.aph.gov.au/parlInfo/home/", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await warmPage.waitForTimeout(1500);
  } catch {
    // Non-fatal — proceed even if the homepage times out
  } finally {
    await warmPage.close();
  }

  return sharedContext;
}

export async function closeParlInfoBrowser() {
  try {
    await sharedContext?.close();
    await browser?.close();
  } catch {}
  sharedContext = null;
  browser = null;
}

/**
 * Extract the most distinctive search keywords from a bill title.
 *
 * Strategy: prefer the text inside parentheses (the specific measure name)
 * plus the year, since those words are most unique to this bill.
 * Falls back to the full title if there are no parentheses.
 */
function buildSearchKeywords(title: string): string {
  const year = title.match(/\b(\d{4})$/)?.[1] ?? "";

  // Prefer the measure name inside the last set of parentheses
  const parenMatch = title.match(/\(([^)]+)\)[^(]*$/);
  if (parenMatch) {
    const inner = parenMatch[1].trim();
    return year ? `${inner} ${year}` : inner;
  }

  // No parens — strip "Bill YYYY" suffix and use the rest
  return title.replace(/\s+Bill\s+\d{4}$/, "").trim();
}

/**
 * Normalise a title for comparison.
 * ParlInfo renders spaces inside parens and around dots ("( No . 1 )"),
 * so we strip all punctuation and collapse whitespace before comparing.
 */
function normaliseTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fetch the text of an Explanatory Memorandum from ParlInfo for a given bill title.
 * Returns null if no matching EM is found or the fetch fails.
 */
export async function fetchBillMemo(title: string): Promise<string | null> {
  try {
    const context = await getBrowserContext();
    const page = await context.newPage();

    try {
      const keywords = buildSearchKeywords(title);
      const searchUrl =
        `https://parlinfo.aph.gov.au/parlInfo/search/summary/summary.w3p` +
        `;query=Dataset:ems%20Title:${encodeURIComponent(keywords)}` +
        `;resCount=5;sort=dateR`;

      await page.goto(searchUrl, { waitUntil: "networkidle", timeout: 45_000 });

      // Find the first result whose title closely matches our bill
      const candidates = await page.$$eval('a[href*="display.w3p"]', (els) =>
        els.map((e) => ({
          href: (e as HTMLAnchorElement).href,
          title: e.textContent?.replace(/\s+/g, " ").trim() ?? "",
        }))
      );

      const normTarget = normaliseTitle(title);
      const match = candidates.find((c) => normaliseTitle(c.title) === normTarget);

      if (!match) {
        // Fallback: accept a result that contains all significant words of our title
        const significantWords = title
          .toLowerCase()
          .replace(/\b(the|and|or|of|a|an|to|in|for|with|bill)\b/g, "")
          .replace(/\W+/g, " ")
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 2);

        const fallback = candidates.find((c) => {
          const ct = normaliseTitle(c.title);
          return significantWords.every((w) => ct.includes(w));
        });

        if (!fallback) {
          console.log(`  No EM found on ParlInfo for: ${title}`);
          return null;
        }
        console.log(`  EM matched via fallback: "${fallback.title}"`);
        return await fetchMemoText(page, fallback.href, title);
      }

      return await fetchMemoText(page, match.href, title);
    } finally {
      await page.close();
    }
  } catch (e) {
    console.warn(`  Memo fetch failed for "${title}": ${(e as Error).message}`);
    return null;
  }
}

async function fetchMemoText(
  page: import("playwright").Page,
  displayUrl: string,
  billTitle: string
): Promise<string | null> {
  await page.goto(displayUrl, { waitUntil: "networkidle", timeout: 45_000 });

  const rawText = await page.evaluate(() => {
    for (const sel of ["nav", "header", "footer", ".nav", ".header", ".footer", "#navigation"]) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    const candidates = [
      document.querySelector("#content"),
      document.querySelector(".document-content"),
      document.querySelector("article"),
      document.querySelector("main"),
      document.querySelector(".body"),
      document.body,
    ];
    for (const el of candidates) {
      if (!el) continue;
      const text = (el as HTMLElement).innerText?.trim();
      if (text && text.length > 300) return text;
    }
    return null;
  });

  if (!rawText) {
    console.log(`  EM page found but no text extracted for: ${billTitle}`);
    return null;
  }

  // cleanMemoText extracts only the General Outline section — no char limit needed
  return cleanMemoText(rawText) || null;
}

/**
 * Extract the General Outline section from an EM.
 *
 * EMs follow a standard structure:
 *   [title / preamble]
 *   GENERAL OUTLINE  (or just OUTLINE)
 *   [the explanatory text we want]
 *   FINANCIAL IMPACT STATEMENT  ← stop here
 *   STATEMENT OF COMPATIBILITY ...
 *   NOTES ON CLAUSES / SCHEDULES ...
 *
 * If the outline section can't be found, returns the first 5 000 chars
 * of the cleaned text as a fallback.
 */
function cleanMemoText(raw: string): string {
  const cleaned = raw
    .replace(/[«»]/g, "")
    .replace(/Note: Where available[^\n]*/gi, "")
    .replace(/Download (Word|PDF)\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Find the start of the outline section
  const outlineMatch = cleaned.match(/\n(GENERAL OUTLINE|OUTLINE)\s*\n/i);
  if (!outlineMatch || outlineMatch.index == null) {
    return cleaned.slice(0, 5_000);
  }
  const outlineStart = outlineMatch.index + outlineMatch[0].length;

  // Find the end of the outline section (next major heading)
  const endPattern = /\n(FINANCIAL IMPACT STATEMENT|STATEMENT OF COMPATIBILITY|NOTES ON CLAUSES|NOTES ON SCHEDULES|SCHEDULE \d|BACKGROUND\s*\n)/i;
  const endMatch = cleaned.slice(outlineStart).match(endPattern);
  const outlineEnd = endMatch?.index != null
    ? outlineStart + endMatch.index
    : outlineStart + 8_000;

  return cleaned.slice(outlineStart, outlineEnd).trim();
}
