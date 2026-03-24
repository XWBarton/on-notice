/**
 * Uses Claude Sonnet to find exact question start timestamps from a condensed
 * ParlView WebVTT transcript. More reliable than regex for rolling captions.
 */

import { callClaude, SONNET } from "./client";

export interface QuestionTimestamp {
  questionNumber: number;
  /** Seconds from the start of Question Time (T+0 = first Speaker call) */
  secFromQtStart: number;
}

export async function extractTimestampsWithAI(
  condensedTranscript: string,
  questions: { questionNumber: number; askerName: string | null; askerParty: string | null; electorate: string | null }[]
): Promise<QuestionTimestamp[]> {
  if (questions.length === 0 || !condensedTranscript.trim()) return [];

  const questionList = questions
    .map((q) => {
      const electorate = q.electorate ? `, ${q.electorate}` : "";
      return `Q${q.questionNumber}: ${q.askerName ?? "Unknown"} (${q.askerParty ?? "?"}${electorate})`;
    })
    .join("\n");

  const result = await callClaude<QuestionTimestamp[]>(
    SONNET,
    `You are analysing Australian Federal Parliament Question Time captions to find when each question starts.
Timestamps in the transcript are seconds from the start of Question Time (T+0s = QT begins).
The Speaker announces questioners with phrases like:
  "I give the call to the member for [Electorate]"
  "Call to the honourable member for [Electorate]"
  "I give the call to the Leader of the Opposition"
  "Call to the Manager of Opposition Business"
  "Recall to the member for [Electorate]"
Return ONLY a JSON array with no explanation. Example: [{"questionNumber":1,"secFromQtStart":45}]`,
    `Questions to find (from Hansard, in order):
${questionList}

The electorate is shown in brackets — e.g. "Q1: Rick Wilson (LIB, O'Connor)" means look for
"call to the member for O'Connor" in the transcript.
Only include questions you can confidently identify. Omit if not found.
Return JSON array: [{"questionNumber": N, "secFromQtStart": T}, ...]

Transcript:
${condensedTranscript}`,
    1024
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (r) => typeof r.questionNumber === "number" && typeof r.secFromQtStart === "number"
  );
}
