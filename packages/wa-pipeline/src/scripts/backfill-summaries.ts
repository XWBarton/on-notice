/**
 * One-off backfill: regenerate WA question AI summaries from the stored
 * question_text/answer_text.
 *
 * Why this exists: summary reuse used to key on question_number alone, but WA
 * Hansard renumbers qonNums between runs. When a number's content changed under
 * it, the slot kept the previous occupant's (now stale) summary — e.g. an
 * opposition question's summary landing on a Dorothy Dixer. The pipeline fix
 * stops new corruption, but existing rows already have matching text and a
 * mismatched summary, so a normal re-run won't notice. This rewrites every WA
 * summary straight from the (correct) stored text.
 *
 * Usage:
 *   ts-node src/scripts/backfill-summaries.ts            # all WA days
 *   ts-node src/scripts/backfill-summaries.ts 2026-06-11 # one date
 */
import { db } from "../db/client";
import { summariseWAQuestion } from "../ai/summarise";

async function main() {
  const dateArg = process.argv[2];

  let daysQuery = db
    .from("sitting_days")
    .select("id, sitting_date, parliament_id")
    .like("parliament_id", "wa_%")
    .order("sitting_date");
  if (dateArg) daysQuery = daysQuery.eq("sitting_date", dateArg);
  const { data: days, error: daysErr } = await daysQuery;
  if (daysErr) throw new Error(`Failed to load sitting days: ${daysErr.message}`);
  if (!days || days.length === 0) {
    console.log("No WA sitting days found.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  for (const d of days as { id: string; sitting_date: string }[]) {
    const { data: qs } = await db
      .from("questions")
      .select("question_number, subject, minister_name, asker_id, question_text, answer_text")
      .eq("sitting_day_id", d.id)
      .order("question_number");

    for (const q of (qs ?? []) as {
      question_number: number;
      subject: string | null;
      minister_name: string | null;
      asker_id: string | null;
      question_text: string | null;
      answer_text: string | null;
    }[]) {
      if (!q.question_text && !q.answer_text) {
        skipped++;
        continue;
      }

      // We only need a display name for the asker; the prompt tolerates a blank.
      let askerName = "";
      if (q.asker_id) {
        const { data: m } = await db
          .from("members")
          .select("name_first, name_last")
          .eq("id", q.asker_id)
          .maybeSingle();
        const mm = m as { name_first: string | null; name_last: string | null } | null;
        askerName = [mm?.name_first, mm?.name_last].filter(Boolean).join(" ").trim();
      }

      const summary = await summariseWAQuestion({
        askerName,
        ministerName: q.minister_name ?? "",
        subject: q.subject,
        questionText: q.question_text ?? "",
        answerText: q.answer_text ?? "",
      });

      const { error: upErr } = await db
        .from("questions")
        .update({ ai_summary: summary })
        .eq("sitting_day_id", d.id)
        .eq("question_number", q.question_number);
      if (upErr) throw new Error(`Update failed (${d.sitting_date} Q${q.question_number}): ${upErr.message}`);
      updated++;
      console.log(`  ${d.sitting_date} Q${q.question_number}: re-summarised`);
    }
  }

  console.log(`\nDone. Re-summarised ${updated} question(s), skipped ${skipped} empty.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
