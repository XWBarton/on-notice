import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const HAIKU = "claude-haiku-4-5-20251001";
export const SONNET = "claude-sonnet-4-6";

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isRateLimit = status === 429 || status === 529;
      if (!isRateLimit || attempt === maxAttempts) throw err;
      const delay = Math.min(2 ** attempt * 2000, 60000); // 4s, 8s, 16s, 32s, 60s
      console.warn(`Rate limited (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

/** Call Claude and return plain text response. */
export async function callClaudeText(
  model: string,
  system: string,
  user: string,
  maxTokens = 512
): Promise<string> {
  return withRetry(async () => {
    const msg = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
  });
}

/** Call Claude and parse JSON response. Handles both objects and arrays. */
export async function callClaude<T>(
  model: string,
  system: string,
  user: string,
  maxTokens = 512
): Promise<T> {
  const text = await callClaudeText(model, system, user, maxTokens);

  // Extract the outermost JSON array or object by finding matching brackets.
  // Using slice(indexOf, lastIndexOf) is more reliable than greedy regex when
  // the AI appends trailing explanation text that also contains brackets.
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");

  const hasArray = arrStart !== -1 && arrEnd > arrStart;
  const hasObject = objStart !== -1 && objEnd > objStart;

  // Prefer array if it starts before or at the same position as the object
  if (hasArray && (!hasObject || arrStart <= objStart)) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    } catch { /* fall through to object */ }
  }
  if (hasObject) {
    try {
      return JSON.parse(text.slice(objStart, objEnd + 1)) as T;
    } catch { /* fall through */ }
  }

  throw new Error(`No valid JSON in Claude response: ${text.slice(0, 300)}`);
}
