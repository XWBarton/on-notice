import { callClaude, SONNET } from "./client";

interface DaySummaryInput {
  date: string;
  parliament: string;
  bills: Array<{ title: string; party: string | null; summary: string | null }>;
  divisions: Array<{ subject: string; result: string; ayes: number; noes: number }>;
  questions: Array<{ asker: string; minister: string; subject: string | null; summary: string | null }>;
}

export async function summariseDay(
  input: DaySummaryInput
): Promise<{ lede: string; digest: string }> {
  const billsBlock =
    input.bills.length > 0
      ? input.bills
          .map((b) => `- ${b.title} (${b.party ?? "Unknown"}): ${b.summary ?? "No summary"}`)
          .join("\n")
      : "No bills introduced today.";

  const divisionsBlock =
    input.divisions.length > 0
      ? input.divisions
          .map(
            (d) =>
              `- ${d.subject}: ${(d.result ?? "unknown").toUpperCase()} (${d.ayes} Ayes, ${d.noes} Noes)`
          )
          .join("\n")
      : "No divisions today.";

  const questionsBlock =
    input.questions.length > 0
      ? input.questions
          .slice(0, 5)
          .map(
            (q) =>
              `- ${q.asker} → ${q.minister}: ${q.subject ?? "No subject"} — ${q.summary ?? "No summary"}`
          )
          .join("\n")
      : "No question time today.";

  return callClaude<{ lede: string; digest: string }>(
    SONNET,
    `You are writing a factual daily parliamentary briefing for Australians.
Be strictly neutral — report what happened, not whether it was good or bad.
Do not characterise politicians' motives, do not editoralise, do not use loaded language.
Stick to: what was introduced, what was voted on, what was asked and answered.
Max 200 words total. No markdown. Always output valid JSON.`,
    `Date: ${input.date}, ${input.parliament}

Bills introduced today:
${billsBlock}

Divisions (votes):
${divisionsBlock}

Question time highlights (Dorothy Dixers removed):
${questionsBlock}

Write a daily digest in plain prose:
1. One-sentence lede stating the most significant event factually
2. A short paragraph covering what bills were introduced, how votes went, and what topics were raised in question time
Do not express opinions on outcomes. Report facts only.
Output JSON: {"lede": "...", "digest": "..."}`
  );
}
