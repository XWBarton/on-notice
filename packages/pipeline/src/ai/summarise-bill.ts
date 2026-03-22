import { callClaude, HAIKU } from "./client";

interface BillSummaryInput {
  shortTitle: string;
  introducerName: string | null;
  introducerParty: string | null;
  introductionText: string | null;
  parliament: string;
  date: string;
}

export async function summariseBill(input: BillSummaryInput): Promise<string> {
  const { summary } = await callClaude<{ summary: string }>(
    HAIKU,
    `You are summarising Australian parliamentary bills for a general audience.
Be concise, factual, and avoid jargon. State what the bill does, not procedural details.
Always output valid JSON.`,
    `Parliament: ${input.parliament}
Bill title: ${input.shortTitle}
Introduced by: ${input.introducerName ?? "Unknown"}${input.introducerParty ? `, ${input.introducerParty}` : ""}
Sitting date: ${input.date}

Hansard excerpt (bill introduction speech):
---
${input.introductionText ?? "(No introduction text available)"}
---

Write a 2-3 sentence plain English summary of what this bill proposes to do.
Output JSON: {"summary": "..."}`
  );

  return summary;
}
