import { callClaude, HAIKU } from "./client";

interface QuestionSummaryInput {
  askerName: string;
  askerParty: string;
  ministerName: string;
  ministerParty: string;
  ministerRole: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
}

export async function summariseQuestion(
  input: QuestionSummaryInput
): Promise<{ summary: string; answeredDirectly: boolean }> {
  return callClaude<{ summary: string; answeredDirectly: boolean }>(
    HAIKU,
    `You are summarising question time exchanges in the Australian Parliament for a general audience.
Be neutral and factual. Focus on what was asked and what the minister's substantive response was (if any).
Use gender-neutral pronouns (they/them) when referring to ministers or members.
Always output valid JSON.`,
    `Question from: ${input.askerName} (${input.askerParty})
To: ${input.ministerName} (${input.ministerParty}${input.ministerRole ? `, ${input.ministerRole}` : ""})
Subject: ${input.subject ?? "Unknown"}

Question:
${input.questionText.slice(0, 1500)}

Response:
${input.answerText.slice(0, 1500)}

Write 1-2 sentences summarising the exchange. Note if the minister answered directly or deflected.
Output JSON: {"summary": "...", "answeredDirectly": true}`
  );
}
