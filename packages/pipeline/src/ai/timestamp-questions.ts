/**
 * Uses Claude Sonnet to find exact question start timestamps from a filtered
 * ParlView WebVTT transcript containing only Speaker announcement lines.
 */

import { callClaude, SONNET } from "./client";

export interface QuestionTimestamp {
  questionNumber: number;
  /** Seconds from the start of Question Time (T+0 = QT begins) */
  secFromQtStart: number;
}

export async function extractTimestampsWithAI(
  speakerCallTranscript: string,
  questions: {
    questionNumber: number;
    askerName: string | null;
    askerParty: string | null;
    electorate: string | null;
    questionText?: string | null;
    isDorothyDixer?: boolean;
  }[],
  chamber: "house" | "senate" = "house"
): Promise<QuestionTimestamp[]> {
  if (questions.length === 0 || !speakerCallTranscript.trim()) return [];

  const questionList = questions
    .map((q) => {
      const parts = [q.askerName ?? "Unknown", `(${q.askerParty ?? "?"}`];
      if (q.electorate) parts.push(`, ${q.electorate}`);
      parts.push(")");
      let line = q.isDorothyDixer
        ? `Q${q.questionNumber}: ${parts.join("")} [Dorothy Dixer — find timestamp only, used as end boundary for preceding question, no clip needed]`
        : `Q${q.questionNumber}: ${parts.join("")}`;
      if (q.questionText) {
        // First ~30 words of the question as a secondary match hint
        const snippet = q.questionText.split(/\s+/).slice(0, 30).join(" ");
        line += ` — starts: "${snippet}${snippet.split(/\s+/).length >= 30 ? "..." : ""}"`;
      }
      return line;
    })
    .join("\n");

  const callPattern =
    chamber === "senate"
      ? `"I give the call to Senator [Name]" or "Call to Senator [Name]"`
      : `"I give the call to the member for [Electorate]" or "Call to the honourable member for [Electorate]"`;

  const result = await callClaude<QuestionTimestamp[]>(
    SONNET,
    `You are finding question start timestamps in Australian Parliament Question Time captions.
The transcript contains only Speaker announcement lines and time markers (--- T+Xs ---).
Timestamps are seconds from the start of Question Time (T+0 = QT begins).

The Speaker announces each questioner with phrases like: ${callPattern}
Also: "I give the call to the Leader of the Opposition", ${chamber === "senate" ? '"Call to the Manager of Opposition Business in the Senate"' : '"Call to the Manager of Opposition Business"'}, etc.

ALL questions are listed — including Dorothy Dixers (same-party questions). Find timestamps for all of them.
Dorothy Dixer timestamps are used as end boundaries for the preceding real question's clip.
Q1 is always the very first Speaker call in the transcript, even if the subtitle starts mid-question.

Return ONLY a JSON array, no explanation: [{"questionNumber":1,"secFromQtStart":45}]`,
    `Questions to find (all questions including Dorothy Dixers, in QT order):
${questionList}

For each question, find the timestamp for the START of that questioner's speech (just before they say "My question is to the...").
- Primary: find the Speaker's call for that questioner (${chamber === "senate" ? '"Senator [Name]"' : '"member for [electorate]"'}) — use the timestamp of that call
- Also try: if no electorate is given, search for the questioner's last name in call patterns (e.g. "member for ... Smith" or "give the call to Smith")
- Secondary: if no Speaker call found, find the FIRST occurrence of "My question is to the Minister" or "My question is to the Prime Minister" AFTER the previous question's timestamp — use 2–3 seconds before that phrase
- Tertiary: if neither found, search for the question's opening words (provided after "— starts:") — use the FIRST occurrence after the previous question's timestamp, NOT any later re-occurrence during the minister's response
- Q1: the Speaker's call for Q1 is often not captured (subtitle lag). Find Q1 by locating the first "My question is to" in the transcript
- IMPORTANT: ministers sometimes paraphrase questions in their response (e.g. "I thank the member for Calare for their question about...") — do NOT use timestamps from within a minister's response, only from the questioner's own speech
- For unknown questions (no name/${chamber === "senate" ? "state" : "electorate"}): count Speaker calls in order after the last identified question
${chamber === "senate" ? "- Senate calls are often brief (e.g. \"Call to Senator Smith\"). Find the FIRST moment the senator is named or called — not when they start speaking." : ""}

Return JSON array: [{"questionNumber": N, "secFromQtStart": T}, ...]
Include ALL questions you can identify — both real and Dorothy Dixer. Omit only if genuinely not found.

Transcript (Speaker calls + first lines of each question):
${speakerCallTranscript}`,
    1024
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (r) =>
      typeof r.questionNumber === "number" &&
      typeof r.secFromQtStart === "number" &&
      r.secFromQtStart >= 0
  );
}
