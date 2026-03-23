import { callClaude, HAIKU } from "./client";

interface DivisionSummaryInput {
  subject: string;
  result: string;
  ayesCount: number;
  noesCount: number;
  divisionNumber: number;
  date: string;
  parliament: string;
}

export async function summariseDivision(input: DivisionSummaryInput): Promise<string> {
  const { summary } = await callClaude<{ summary: string }>(
    HAIKU,
    `You are summarising Australian parliamentary division (vote) results for a general audience.
Be concise and factual. Explain what was specifically being voted on — if the subject includes a stage like "Second Reading", "Third Reading", "Report from Federation Chamber", or "Amendment", explain what that stage means and what the vote outcome means.
If the subject mentions a report stage or amendment, clarify that this is a procedural vote separate from the final passage of the bill.
Always output valid JSON.`,
    `Parliament: ${input.parliament}
Date: ${input.date}
Division number: ${input.divisionNumber}
Division subject: ${input.subject}
Result: ${input.result} (${input.ayesCount} ayes, ${input.noesCount} noes)

In 1-2 sentences, explain in plain English what specifically was being voted on (including the procedural stage) and what the outcome means.
Output JSON: {"summary": "..."}`
  );

  return summary;
}
