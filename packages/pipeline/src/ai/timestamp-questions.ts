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
  }[],
  chamber: "house" | "senate" = "house"
): Promise<QuestionTimestamp[]> {
  if (questions.length === 0 || !speakerCallTranscript.trim()) return [];

  const questionList = questions
    .map((q) => {
      const parts = [q.askerName ?? "Unknown", `(${q.askerParty ?? "?"}`];
      if (q.electorate) parts.push(`, ${q.electorate}`);
      parts.push(")");
      let line = `Q${q.questionNumber}: ${parts.join("")}`;
      if (q.questionText) {
        // First ~30 words of the question as a secondary match hint
        const snippet = q.questionText.split(/\s+/).slice(0, 30).join(" ");
        line += ` — starts: "${snippet}${snippet.split(/\s+/).length >= 30 ? "..." : ""}"`;
      }
      return line;
    })
    .join("\n");

  const memberTitle = chamber === "senate" ? "senator" : "member for [Electorate]";
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

Question numbers may not be sequential — Dorothy Dixer questions (same-party questions) are omitted.
For questions where no name/${chamber === "senate" ? "state" : "electorate"} is given, identify them by counting Speaker calls in order after the last identified question.
Q1 is always the very first Speaker call in the transcript, even if the subtitle starts mid-question.

Return ONLY a JSON array, no explanation: [{"questionNumber":1,"secFromQtStart":45}]`,
    `Questions to find (non-Dorothy-Dixer questions from Hansard, in QT order):
${questionList}

For each question, find when the Speaker calls that questioner.
- Primary: search for the Speaker calling ${chamber === "senate" ? '"Senator [Name]"' : '"member for [electorate]"'}
- Secondary: if no Speaker call found, search for the question's opening words (provided after "— starts:") anywhere in the transcript
- Q1: the Speaker's call for Q1 is never captured (subtitle lag). Find Q1 by searching for its opening words in the full transcript
- For unknown questions (no name/${chamber === "senate" ? "state" : "electorate"}): count Speaker calls in order after the last identified question

Return JSON array: [{"questionNumber": N, "secFromQtStart": T}, ...]
Only include questions you can identify. Omit if genuinely not found.

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
