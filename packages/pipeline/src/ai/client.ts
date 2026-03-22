import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const HAIKU = "claude-haiku-4-5-20251001";
export const SONNET = "claude-sonnet-4-6";

/** Call Claude and parse JSON response. Throws if response is not valid JSON. */
export async function callClaude<T>(
  model: string,
  system: string,
  user: string
): Promise<T> {
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 512,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]) as T;
}
