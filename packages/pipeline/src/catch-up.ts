/**
 * Works out which sitting days need (re)processing.
 *
 * The old nightly job blindly retried "the last 4 days". OpenAustralia regularly
 * publishes a sitting day later than that (in 2026: 11 Aug landed 26 Aug, 12 Oct landed
 * 8 Nov), so those days were never picked up at all. Instead of guessing a window, this
 * asks OA what it actually has and compares that to what we've stored:
 *
 *   - Hansard exists upstream but we have no complete day     → process it
 *   - OA (re)published the file after we last processed it    → check it for changes
 *   - a previous refresh of the day failed                    → try again
 *   - nothing upstream yet, but the day is recent             → try the JSON API
 *
 * Everything else is skipped without a single request, so a wide look-back is cheap.
 */

import { db } from "./db/client";
import { listScrapedXml } from "./scrapers/fed-hansard";

export interface CatchUpTask {
  date: string;
  reason: string;
}

/** Days for which it's still worth probing the JSON API when no XML is published yet. */
const RECENT_DAYS = 7;

const sydneyDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(d);

export async function planCatchUp(opts: {
  parliamentId: string;
  oaType: "representatives" | "senate";
  days: number;
  /** Re-check every day in the window against Hansard, not just ones OA has touched. */
  verifyAll: boolean;
}): Promise<CatchUpTask[]> {
  const { parliamentId, oaType, days, verifyAll } = opts;

  // Yesterday (Sydney) back to `days` ago, newest first so fresh days are never starved
  // by a long backlog.
  const dates: string[] = [];
  for (let i = 1; i <= days; i++) dates.push(sydneyDate(new Date(Date.now() - i * 864e5)));
  const oldest = dates[dates.length - 1];

  const listing = await listScrapedXml(oaType).catch((e: Error) => {
    console.warn(`  Could not list OA scraped XML (${e.message}) — falling back to recent days only`);
    return null;
  });

  const { data: rows, error } = await db
    .from("sitting_days")
    .select("sitting_date, pipeline_status, pipeline_error, daily_digests(generated_at)")
    .eq("parliament_id", parliamentId)
    .gte("sitting_date", oldest);
  if (error) throw new Error(`Catch-up: could not read sitting_days: ${error.message}`);

  const stored = new Map<string, { status: string; error: string | null; processedAt: Date | null }>();
  for (const r of rows ?? []) {
    const digest = r.daily_digests as unknown as { generated_at: string } | { generated_at: string }[] | null;
    const generatedAt = Array.isArray(digest) ? digest[0]?.generated_at : digest?.generated_at;
    stored.set(r.sitting_date, {
      status: r.pipeline_status,
      error: r.pipeline_error,
      processedAt: generatedAt ? new Date(generatedAt) : null,
    });
  }

  const tasks: CatchUpTask[] = [];
  dates.forEach((date, idx) => {
    const row = stored.get(date);
    const publishedAt = listing?.get(date) ?? null;
    const isRecent = idx < RECENT_DAYS;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    if (row?.status === "complete") {
      if (row.error) {
        tasks.push({ date, reason: "previous refresh failed" });
      } else if (publishedAt && (!row.processedAt || publishedAt > row.processedAt)) {
        tasks.push({ date, reason: "OpenAustralia published Hansard after we processed this day" });
      } else if (verifyAll && publishedAt) {
        tasks.push({ date, reason: "verifying against Hansard" });
      }
      return;
    }

    if (publishedAt) {
      tasks.push({ date, reason: row ? `Hansard available, day is "${row.status}"` : "Hansard available, day never processed" });
    } else if (isRecent && !isWeekend) {
      tasks.push({ date, reason: "recent day, no Hansard XML yet — trying the JSON API" });
    }
  });

  return tasks;
}
