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
 * Retry transient Anthropic failures: rate limits / overloads (429/529) and
 * network drops (APIConnectionError / ECONNRESET), which are common on long
 * caption-transcript requests. Permanent errors (4xx) bubble up immediately.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      const isRateLimit = status === 429 || status === 529;
      const isConnErr = err instanceof Anthropic.APIConnectionError || code === "ECONNRESET" || code === "ETIMEDOUT";
      if ((!isRateLimit && !isConnErr) || attempt === maxAttempts) throw err;
      const delay = Math.min(2 ** attempt * 1000, 30000); // 2s, 4s, 8s, 16s, 30s
      console.warn(`  Timestamp AI transient error (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

/**
 * Find the matching closing bracket for the first occurrence of `open`, ignoring
 * brackets inside strings. Returns [start, end] inclusive, or null. Robust to the
 * model appending trailing prose that contains brackets (a greedy regex is not).
 */
function findMatchingBracket(text: string, open: string, close: string): [number, number] | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return [start, i];
    }
  }
  return null;
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

  const text = await withRetry(async () => {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: `You locate parliamentary questions in a Question Time transcript from the Western Australian Parliament. The transcript is machine-generated captions (names and words are often mis-transcribed — match phonetically and by content). Each [mm:ss] marker is seconds from the start of the audio.

Questions appear in order. Each question starts when the presiding officer calls the member (or the member starts stating their question) and ends when the minister finishes answering — i.e. just before the next question's member is called. For the last question, end at the final substantive content.

Respond with only valid JSON: an array of {"questionNumber": n, "startSec": n, "endSec": n}. Convert [mm:ss] to seconds. Include every question you can locate; omit any you genuinely cannot find. Do not add any commentary before or after the JSON.`,
      messages: [
        {
          role: "user",
          content: `Questions asked (in order):\n${questionList}\n\nTranscript:\n${transcript}`,
        },
      ],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
  });

  const bounds = findMatchingBracket(text, "[", "]");
  if (!bounds) throw new Error(`Timestamp AI returned no JSON array: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(bounds[0], bounds[1] + 1)) as WAQuestionTimestamp[];

  return parsed
    .filter((t) => Number.isFinite(t.startSec) && Number.isFinite(t.endSec) && t.endSec > t.startSec)
    .sort((a, b) => a.startSec - b.startSec);
}
