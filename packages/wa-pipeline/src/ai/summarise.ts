import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function summariseWAQuestion(input: {
  askerName: string;
  ministerName: string;
  subject: string | null;
  questionText: string;
  answerText: string;
}): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system:
      "You are summarising question time exchanges in the Western Australian Parliament for a general audience. Be neutral and factual. Respond with only the summary text — no JSON, no labels.",
    messages: [
      {
        role: "user",
        content: `Question from ${input.askerName} to ${input.ministerName || "the minister"}${input.subject ? ` about: ${input.subject}` : ""}.

Question:
${input.questionText.slice(0, 1200)}

Response:
${input.answerText.slice(0, 1200)}

Write 1-2 sentences summarising the exchange. Note if the minister answered directly or deflected.`,
      },
    ],
  });

  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();
}
