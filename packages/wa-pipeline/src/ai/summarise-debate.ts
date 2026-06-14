import Anthropic from "@anthropic-ai/sdk";
import type { ProceedingType, DebateSpeech } from "../parsers/debate";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TYPE_LABEL: Record<ProceedingType, string> = {
  grievance: "grievance debate",
  ministerial_statement: "ministerial statement",
  member_statement: "member's statement",
};

export async function summariseWADebate(input: {
  type: ProceedingType;
  title: string;
  speeches: DebateSpeech[];
}): Promise<string> {
  // Keep the prompt bounded — early speeches carry the substance.
  const transcript = input.speeches
    .map((s) => `${s.speaker}: ${s.text}`)
    .join("\n\n")
    .slice(0, 4000);

  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system:
      "You are summarising proceedings of the Western Australian Parliament for a general audience. Be neutral and factual. Respond with only the summary text — no JSON, no labels.",
    messages: [
      {
        role: "user",
        content: `This is a ${TYPE_LABEL[input.type]} titled "${input.title}".

Transcript:
${transcript}

Write 1-2 sentences summarising what was raised and, where relevant, the government's response.`,
      },
    ],
  });

  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();
}
