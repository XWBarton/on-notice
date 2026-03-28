/**
 * Uses Claude Sonnet to find exact question start timestamps from a filtered
 * ParlView WebVTT transcript containing only Speaker announcement lines.
 */

import { callClaude, SONNET } from "./client";

export interface QuestionTimestamp {
  questionNumber: number;
  /** Seconds from the start of Question Time (T+0 = QT begins) */
  secFromQtStart: number;
  /** Seconds from QT start when the minister finishes answering (just before the next Speaker call) */
  endSecFromQtStart?: number;
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
    `You are finding question timestamps in Australian Parliament Question Time captions.
The transcript contains Speaker announcement lines, surrounding context lines, and time markers (--- T+Xs ---).
Timestamps are seconds from the start of Question Time (T+0 = QT begins).

The Speaker announces each questioner with phrases like: ${callPattern}
Also: "I give the call to the Leader of the Opposition", ${chamber === "senate" ? '"Call to the Manager of Opposition Business in the Senate"' : '"Call to the Manager of Opposition Business"'}, etc.

ALL questions are listed — including Dorothy Dixers (same-party questions). Find timestamps for all of them.
Dorothy Dixer timestamps are used as end boundaries for the preceding real question's clip.
Q1 is always the very first Speaker call in the transcript, even if the subtitle starts mid-question.

Return ONLY a JSON array, no explanation: [{"questionNumber":1,"secFromQtStart":45,"endSecFromQtStart":118}]`,
    `Questions to find (all questions including Dorothy Dixers, in QT order):
${questionList}

For each question, find TWO timestamps:

1. START (secFromQtStart): when the questioner begins speaking.
- Primary: find the Speaker's call for that questioner (${chamber === "senate" ? '"Senator [Name]"' : '"member for [electorate]"'}) — use the timestamp of that call
- Also try: if no electorate is given, search for the questioner's last name in call patterns (e.g. "member for ... Smith" or "give the call to Smith")
- Secondary: if no Speaker call found, find where the questioner says "My question is to the Minister" or "My question is to the Prime Minister" — the timestamp should be 2–3 seconds BEFORE that phrase appears
- Tertiary: if neither found, search for the question's opening words (provided after "— starts:") anywhere in the transcript
- Q1: the Speaker's call for Q1 is often not captured (subtitle lag). Find Q1 by locating "My question is to" in the transcript
- For unknown questions (no name/${chamber === "senate" ? "state" : "electorate"}): count Speaker calls in order after the last identified question
${chamber === "senate" ? "- Senate calls are often brief (e.g. \"Call to Senator Smith\"). Find the FIRST moment the senator is named or called — not when they start speaking." : ""}

2. END (endSecFromQtStart): when the minister finishes answering — the last line of the minister's response, just before the Speaker calls the next questioner or order is called.
- Look at the lines just BEFORE the next question's Speaker call in the transcript
- The end is the timestamp of the last substantive speech line before the next Speaker announcement
- Omit endSecFromQtStart if you cannot confidently identify it

Return JSON array: [{"questionNumber": N, "secFromQtStart": T, "endSecFromQtStart": U}, ...]
Include ALL questions you can identify — both real and Dorothy Dixer. Omit only if genuinely not found.

Transcript (Speaker calls + surrounding context lines):
${speakerCallTranscript}`,
    1500
  );

  if (!Array.isArray(result)) return [];
  return result
    .filter(
      (r) =>
        typeof r.questionNumber === "number" &&
        typeof r.secFromQtStart === "number" &&
        r.secFromQtStart >= 0
    )
    .map((r) => ({
      questionNumber: r.questionNumber,
      secFromQtStart: r.secFromQtStart,
      ...(typeof r.endSecFromQtStart === "number" && r.endSecFromQtStart > r.secFromQtStart
        ? { endSecFromQtStart: r.endSecFromQtStart }
        : {}),
    }));
}
