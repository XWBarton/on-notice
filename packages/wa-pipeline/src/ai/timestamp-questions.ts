import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface WAQuestionTimestamp {
  questionNumber: number;
  /** Seconds from the start of the QWN audio */
  startSec: number;
  /** Seconds when the answer finishes (start of the next question's call, or end of audio) */
  endSec: number;
}

/**
 * Locate each question's start/end in the QWN transcript. The transcript is
 * machine-transcribed rolling captions with [mm:ss] markers relative to the
 * start of the audio, covering only Questions Without Notice.
 */
export async function timestampWAQuestions(
  transcript: string,
  questions: {
    questionNumber: number;
    askerName: string;
    ministerName: string;
    questionText: string;
    isDorothyDixer: boolean;
  }[]
): Promise<WAQuestionTimestamp[]> {
  if (questions.length === 0 || !transcript.trim()) return [];

  const questionList = questions
    .map((q) => {
      const snippet = q.questionText.split(/\s+/).slice(0, 30).join(" ");
      return `Q${q.questionNumber}: asked by ${q.askerName}${q.ministerName ? ` to ${q.ministerName}` : ""}${q.isDorothyDixer ? " [government backbencher question]" : ""} — begins: "${snippet}..."`;
    })
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You locate parliamentary questions in a Question Time transcript from the Western Australian Parliament. The transcript is machine-generated captions (names and words are often mis-transcribed — match phonetically and by content). Each [mm:ss] marker is seconds from the start of the audio.

Questions appear in order. Each question starts when the presiding officer calls the member (or the member starts stating their question) and ends when the minister finishes answering — i.e. just before the next question's member is called. For the last question, end at the final substantive content.

Respond with only valid JSON: an array of {"questionNumber": n, "startSec": n, "endSec": n}. Convert [mm:ss] to seconds. Include every question you can locate; omit any you genuinely cannot find.`,
    messages: [
      {
        role: "user",
        content: `Questions asked (in order):\n${questionList}\n\nTranscript:\n${transcript}`,
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Timestamp AI returned no JSON array");
  const parsed = JSON.parse(jsonMatch[0]) as WAQuestionTimestamp[];

  return parsed
    .filter((t) => Number.isFinite(t.startSec) && Number.isFinite(t.endSec) && t.endSec > t.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}
