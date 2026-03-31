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

/**
 * Find the matching closing bracket for the first occurrence of `open` in text.
 * Returns [startIndex, endIndex] inclusive, or null if not found.
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

/** Call Claude and parse JSON response. Handles both objects and arrays. */
export async function callClaude<T>(
  model: string,
  system: string,
  user: string,
  maxTokens = 512
): Promise<T> {
  const text = await callClaudeText(model, system, user, maxTokens);

  // Extract the outermost JSON structure using proper bracket-depth matching.
  // lastIndexOf fails when the AI appends trailing text containing brackets.
  const arrBounds = findMatchingBracket(text, "[", "]");
  const objBounds = findMatchingBracket(text, "{", "}");

  // Prefer array if it starts before or at the same position as the object
  if (arrBounds && (!objBounds || arrBounds[0] <= objBounds[0])) {
    try {
      return JSON.parse(text.slice(arrBounds[0], arrBounds[1] + 1)) as T;
    } catch { /* fall through to object */ }
  }
  if (objBounds) {
    try {
      return JSON.parse(text.slice(objBounds[0], objBounds[1] + 1)) as T;
    } catch { /* fall through */ }
  }

  // Handle null literal (valid JSON, but not an array or object)
  if (/\bnull\b/.test(text)) return null as T;

  throw new Error(`No valid JSON in Claude response: ${text.slice(0, 300)}`);
}
