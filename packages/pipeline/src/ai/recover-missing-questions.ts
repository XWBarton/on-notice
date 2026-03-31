/**
 * Recovers questions that OpenAustralia missed by extracting them from
 * ParlView closed captions. Used as a fallback when the OA question count
 * is lower than what the captions indicate.
 *
 * The captions are auto-generated and contain speech recognition errors —
 * Claude cleans up the text when reconstructing questions and answers.
 */

import { callClaude, SONNET } from "./client";

export interface RecoveredQuestion {
  askerName: string;
  ministerName: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
  /** Name of the questioner who spoke just before this one (used for ordering) */
  afterAskerName: string | null;
}

export async function recoverMissingQuestions(
  speakerCallTranscript: string,
  rawQtCaptions: string,
  knownQuestions: { askerName: string | null; subject: string | null }[]
): Promise<RecoveredQuestion[]> {
  const knownList = knownQuestions
    .filter((q) => q.askerName)
    .map((q, i) => `Q${i + 1}: ${q.askerName} — ${q.subject ?? "unknown subject"}`)
    .join("\n");

  const result = await callClaude<RecoveredQuestion[]>(
    SONNET,
    `You are recovering missing questions from Australian Parliament Question Time captions.
The captions are auto-generated and contain speech recognition errors — clean them up when reconstructing questions and answers.
Return only valid JSON.`,
    `The following questions were captured from the official Hansard (via OpenAustralia):
${knownList || "(none yet)"}

Using the speaker-call transcript below, identify any questioners NOT in the list above.
For each missing questioner, extract their question and the minister's response from the raw captions.

Return a JSON array (return [] if no missing questions):
[{
  "askerName": "First Last",
  "ministerName": "First Last",
  "subject": "2-4 word topic",
  "questionText": "full question text, cleaned up from captions",
  "answerText": "minister's full response, cleaned up from captions",
  "afterAskerName": "name of the questioner who spoke immediately before this one, or null if first"
}]

Speaker-call transcript (for identifying questioner order):
${speakerCallTranscript}

Raw Question Time captions (for extracting question/answer text):
${rawQtCaptions}`,
    2500
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (r) => typeof r.askerName === "string" && r.askerName.trim().length > 0
  );
}
