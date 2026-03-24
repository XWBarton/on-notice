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
  // Try JSON array of objects first, then plain object, then any array
  const jsonMatch =
    text.match(/\[\s*\{[\s\S]*\}\s*\]/) ||
    text.match(/\{[\s\S]*\}/) ||
    text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]) as T;
}
