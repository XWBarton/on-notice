/**
 * Backfill bill summaries using Explanatory Memoranda.
 *
 * Finds all bills in sitting days on or after a given date,
 * fetches their EM from ParlInfo, and re-generates the AI summary.
 *
 * Usage: ts-node src/backfill-bills.ts --from 2026-03-25
 *        ts-node src/backfill-bills.ts --from 2026-03-25 --parliament fed_hor
 */

import { parseArgs } from "node:util";
import { db } from "./db/client";
import { fetchBillMemo, closeParlInfoBrowser } from "./scrapers/parlinfo";
import { summariseBill } from "./ai/summarise-bill";
import { brainrotify } from "./ai/brainrotify";

async function run() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: "2026-03-25" },
      parliament: { type: "string", default: "" },
    },
  });

  const fromDate = values.from as string;
  const parliamentFilter = values.parliament as string;

  console.log(`\n=== Bill Summary Backfill ===`);
  console.log(`From date: ${fromDate}`);
  console.log(`Parliament: ${parliamentFilter || "all federal"}`);
  console.log(`============================\n`);

  // Find all sitting days since the given date
  let sittingQuery = db
    .from("sitting_days")
    .select("id, sitting_date, parliament_id")
    .gte("sitting_date", fromDate)
    .in("parliament_id", parliamentFilter ? [parliamentFilter] : ["fed_hor", "fed_sen"])
    .order("sitting_date");

  const { data: sittingDays, error: sdError } = await sittingQuery;
  if (sdError) throw new Error(`Failed to fetch sitting days: ${sdError.message}`);
  if (!sittingDays?.length) {
    console.log("No sitting days found.");
    return;
  }

  console.log(`Found ${sittingDays.length} sitting day(s) to process.\n`);

  let totalBills = 0;
  let totalWithMemo = 0;

  for (const day of sittingDays) {
    console.log(`\n── ${day.sitting_date} (${day.parliament_id}) ──`);

    const { data: bills, error: billError } = await db
      .from("bills")
      .select("id, short_title, introduced_by, bill_stage")
      .eq("sitting_day_id", day.id);

    if (billError) {
      console.warn(`  Error fetching bills: ${billError.message}`);
      continue;
    }

    if (!bills?.length) {
      console.log("  No bills.");
      continue;
    }

    console.log(`  ${bills.length} bill(s)`);

    for (const bill of bills) {
      totalBills++;
      console.log(`\n  Processing: ${bill.short_title}`);

      const memoText = await fetchBillMemo(bill.short_title);
      if (memoText) {
        totalWithMemo++;
        console.log(`  EM found (${memoText.length} chars)`);
      } else {
        console.log(`  No EM found`);
      }

      // Get introducer name if available
      let introducerName: string | null = null;
      if (bill.introduced_by) {
        const { data: member } = await db
          .from("members")
          .select("name_display")
          .eq("id", bill.introduced_by)
          .single();
        introducerName = member?.name_display ?? null;
      }

      const summary = await summariseBill({
        shortTitle: bill.short_title,
        introducerName,
        introducerParty: null,
        introductionText: null,
        memoText,
        parliament: day.parliament_id === "fed_sen" ? "Australian Senate" : "Australian House of Representatives",
        date: day.sitting_date,
      }).catch((e) => {
        console.warn(`  Summary failed: ${e.message}`);
        return null;
      });

      if (!summary) continue;

      const brainrotSummary = await brainrotify(summary).catch(() => null);

      const { error: updateError } = await db
        .from("bills")
        .update({ ai_summary: summary, brainrot_summary: brainrotSummary })
        .eq("id", bill.id);

      if (updateError) {
        console.warn(`  Update failed: ${updateError.message}`);
      } else {
        console.log(`  Updated.`);
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Bills processed: ${totalBills}`);
  console.log(`EMs found: ${totalWithMemo}/${totalBills}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeParlInfoBrowser());
