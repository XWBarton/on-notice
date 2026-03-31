/**
 * Recovers questions that OpenAustralia missed by extracting them from
 * ParlView closed captions. Used as a fallback when OA hasn't indexed
 * a question yet.
 *
 * Two-step process:
 *  1. identifyMissingQuestioners — reads the small speaker-call filtered
 *     transcript to find questioner names + approximate timestamps that
 *     aren't in our OA list.
 *  2. extractQuestionFromCaptions — given a targeted ~7-minute window of
 *     raw captions around a specific questioner, extracts the full Q&A.
 *
 * Splitting the steps avoids the truncation problem: the full raw QT
 * captions are too large to send as one blob, but a targeted 7-minute
 * window per missing questioner is compact and accurate.
 */

import { callClaude, SONNET, HAIKU } from "./client";

export interface MissingQuestioner {
  name: string;
  /** Seconds from QT start (T+0) when this questioner was called */
  approxStartSec: number;
  /** Name of the questioner who spoke immediately before this one */
  afterAskerName: string | null;
}

export interface RecoveredQuestion {
  askerName: string;
  ministerName: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
  afterAskerName: string | null;
}

/**
 * Step 1: read the speaker-call filtered transcript and return any
 * questioners whose names don't appear in the known OA list, along with
 * their approximate T+ timestamps and ordering.
 */
export async function identifyMissingQuestioners(
  speakerCallTranscript: string,
  knownQuestions: { askerName: string | null }[]
): Promise<MissingQuestioner[]> {
  const knownNames = knownQuestions
    .filter((q) => q.askerName)
    .map((q) => q.askerName!)
    .join(", ");

  const result = await callClaude<MissingQuestioner[]>(
    HAIKU,
    `You are identifying missing questioners in Australian Parliament Question Time captions.
Return only valid JSON.`,
    `Known questioners already captured from Hansard: ${knownNames || "(none)"}

Read the speaker-call transcript below and identify any questioners who are NOT in the known list above.
Each questioner is either called by the President (e.g. "Senator [Name]") or opens with "My question is to".

For each missing questioner return:
- name: their full name as best you can determine
- approxStartSec: the T+ seconds value from the transcript line where they were called or started speaking
- afterAskerName: the name of the questioner who spoke immediately before them (from the known list or other recovered questioners), or null if they appear first

Return [] if no missing questioners found.

Transcript:
${speakerCallTranscript}`,
    800
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (r) => typeof r.name === "string" && r.name.trim().length > 0 && typeof r.approxStartSec === "number"
  );
}

/**
 * Step 2: given a targeted ~7-minute window of raw captions around a
 * specific questioner, extract and clean up the full Q&A exchange.
 */
export async function extractQuestionFromCaptions(
  askerName: string,
  rawCaptionsWindow: string
): Promise<Omit<RecoveredQuestion, "afterAskerName"> | null> {
  const result = await callClaude<{ ministerName: string | null; subject: string | null; questionText: string; answerText: string } | null>(
    SONNET,
    `You are reconstructing an Australian Parliament Question Time exchange from auto-generated captions.
The captions contain speech recognition errors — clean them up to produce readable text.
Return only valid JSON.`,
    `Extract the full question and ministerial response for Senator/Member ${askerName} from these captions.
Include all supplementary questions and their responses in the answerText.
Clean up speech recognition errors to produce readable prose.

Return JSON:
{
  "ministerName": "First Last",
  "subject": "2-4 word topic",
  "questionText": "full primary question text, cleaned up",
  "answerText": "full minister response including responses to supplementaries, cleaned up"
}

Captions:
${rawCaptionsWindow}`,
    2000
  );

  if (!result || typeof result.questionText !== "string") return null;
  return result;
}
