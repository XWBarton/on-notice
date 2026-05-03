import { callClaude, HAIKU } from "./client";

interface BillSummaryInput {
  shortTitle: string;
  introducerName: string | null;
  introducerParty: string | null;
  introductionText: string | null;
  memoText: string | null;
  parliament: string;
  date: string;
}

export async function summariseBill(input: BillSummaryInput): Promise<string> {
  const { summary } = await callClaude<{ summary: string }>(
    HAIKU,
    `You explain Australian parliamentary bills to a general audience.
Write in plain English — no jargon, no procedural language. Assume the reader has no legal background.
Always output valid JSON.`,
    `Parliament: ${input.parliament}
Bill title: ${input.shortTitle}
Introduced by: ${input.introducerName ?? "Unknown"}${input.introducerParty ? `, ${input.introducerParty}` : ""}
Sitting date: ${input.date}
${input.memoText ? `
Explanatory Memorandum — General Outline (official government explanation):
---
${input.memoText}
---
` : `
Hansard excerpt (introduction speech):
---
${input.introductionText ?? "(No introduction text available)"}
---
`}
Write a 3–5 sentence explanation that covers:
1. What this bill does — the core change it makes
2. Which existing laws it amends or creates (name them specifically if the outline mentions them)
3. Why it matters — what problem it solves or what changes for people

Start with the substance, not with "This bill...". Be specific — name the laws, agencies, or people affected.
Do not mention the bill title or the word "bill" in the summary.
Output JSON: {"summary": "..."}`
  );

  return summary;
}
