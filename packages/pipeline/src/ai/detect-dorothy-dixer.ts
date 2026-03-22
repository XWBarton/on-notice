import { callClaude, HAIKU } from "./client";

interface DetectInput {
  askerName: string;
  askerParty: string;
  ministerName: string;
  ministerParty: string;
  governmentParties: string[];
  questionText: string;
}

export async function detectDorothyDixerAI(
  input: DetectInput
): Promise<{ isDorothyDixer: boolean; confidence: string; reason: string }> {
  const result = await callClaude<{
    is_dorothy_dixer: boolean;
    confidence: "high" | "medium" | "low";
    reason: string;
  }>(
    HAIKU,
    `Determine if a parliamentary question is a "Dorothy Dixer" — a staged question from a government member to a government minister designed to allow the minister to deliver a prepared speech rather than face genuine scrutiny.
Always output valid JSON.`,
    `Asker: ${input.askerName}, party: ${input.askerParty}
Minister being asked: ${input.ministerName}, party: ${input.ministerParty}
Government party(ies) currently in power: ${input.governmentParties.join(", ")}

Question (first 500 chars):
${input.questionText.slice(0, 500)}

Respond JSON: {"is_dorothy_dixer": true, "confidence": "high", "reason": "..."}`
  );

  return {
    isDorothyDixer: result.is_dorothy_dixer,
    confidence: result.confidence,
    reason: result.reason,
  };
}
