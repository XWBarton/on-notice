import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * AI fallback for Dorothy Dixer detection — used only when the asker's party
 * is unknown (member missing from the DB), mirroring the federal pipeline.
 */
export async function detectWADorothyDixer(input: {
  askerName: string;
  ministerName: string;
  questionText: string;
}): Promise<boolean> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 128,
    system:
      'You classify Western Australian parliamentary questions. A "Dorothy Dixer" is a staged question from a government member to a government minister designed to let the minister deliver a prepared speech rather than face genuine scrutiny. Respond with only valid JSON.',
    messages: [
      {
        role: "user",
        content: `Asker: ${input.askerName}
Minister being asked: ${input.ministerName || "unknown"}
Government party currently in power: Australian Labor Party (WA)

Question (first 500 chars):
${input.questionText.slice(0, 500)}

Respond JSON: {"is_dorothy_dixer": true}`,
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  return Boolean(parsed.is_dorothy_dixer);
}
