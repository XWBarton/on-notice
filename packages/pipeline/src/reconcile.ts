/**
 * Decides whether a sitting day we already processed still matches Hansard.
 *
 * "Complete" used to be final: whatever the first successful run stored was never
 * revisited. But the first run often sees only part of the day (OA's JSON API in proof
 * stage, or questions reconstructed from captions), and OA publishes or republishes the
 * full record later. Comparing the stored questions against the current Hansard XML lets
 * the pipeline notice and repair that on its own.
 *
 * The comparison is structural (which questions exist, in what order, and whether they
 * have answers) rather than textual, so routine proof→final wording corrections don't
 * trigger an expensive re-run of summaries and audio.
 */

import type { ParsedQuestion } from "./parsers/hansard-xml";

export interface StoredQuestion {
  question_number: number | null;
  subject: string | null;
  answer_text: string | null;
  source_note: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** Returns human-readable reasons the stored day is out of date; empty means in sync. */
export function hansardDrift(parsed: ParsedQuestion[], stored: StoredQuestion[]): string[] {
  const reasons: string[] = [];
  const ordered = [...stored].sort((a, b) => (a.question_number ?? 0) - (b.question_number ?? 0));

  const captionDerived = ordered.filter((q) => q.source_note).length;
  if (captionDerived > 0) {
    reasons.push(`${captionDerived} stored question(s) were reconstructed from captions — Hansard now has the real record`);
  }

  if (ordered.length !== parsed.length) {
    reasons.push(`stored ${ordered.length} question(s), Hansard has ${parsed.length}`);
    return reasons;
  }

  const firstDiff = parsed.findIndex((q, i) => norm(q.subject) !== norm(ordered[i].subject));
  if (firstDiff >= 0) {
    reasons.push(
      `question ${firstDiff + 1} differs (stored "${ordered[firstDiff].subject ?? ""}", Hansard "${parsed[firstDiff].subject ?? ""}")`
    );
  }

  const newlyAnswered = parsed.filter((q, i) => q.answerText && !ordered[i].answer_text).length;
  if (newlyAnswered > 0) {
    reasons.push(`${newlyAnswered} question(s) stored without an answer now have one in Hansard`);
  }

  return reasons;
}
