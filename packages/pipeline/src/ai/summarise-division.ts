import { callClaude, HAIKU } from "./client";

interface DivisionSummaryInput {
  subject: string;
  result: string;
  ayesCount: number;
  noesCount: number;
  date: string;
  parliament: string;
}

export async function summariseDivision(input: DivisionSummaryInput): Promise<string> {
  const { summary } = await callClaude<{ summary: string }>(
    HAIKU,
    `You are summarising Australian parliamentary division (vote) results for a general audience.
Be concise and factual. Explain what was being voted on in plain English — what bill, amendment, or motion it was, and what the outcome means.
Always output valid JSON.`,
    `Parliament: ${input.parliament}
Date: ${input.date}
Division subject: ${input.subject}
Result: ${input.result} (${input.ayesCount} ayes, ${input.noesCount} noes)

In 1-2 sentences, explain what was being voted on and what the result means in plain English.
Output JSON: {"summary": "..."}`
  );

  return summary;
}
