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
    `You are writing a daily parliamentary briefing for politically engaged Australians.
Tone: informative, neutral, slightly dry wit is acceptable. Max 200 words total.
Do NOT use markdown formatting — no bold, no asterisks, no headers.
Always output valid JSON.`,
    `Date: ${input.date}, ${input.parliament}

Bills introduced today:
${billsBlock}

Divisions (votes):
${divisionsBlock}

Question time highlights (Dorothy Dixers removed):
${questionsBlock}

Write a daily digest in plain prose (no markdown):
1. One-sentence lede summarising the most significant event
2. A short paragraph covering bills, votes, and question time highlights
Output JSON: {"lede": "...", "digest": "..."}`
  );
}
