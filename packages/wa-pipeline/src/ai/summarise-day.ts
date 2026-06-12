import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface WADaySummaryInput {
  date: string;
  chamber: string;
  questions: Array<{
    asker: string;
    minister: string;
    subject: string | null;
    summary: string | null;
  }>;
}

/**
 * Generate a factual daily digest for a WA sitting day.
 * Mirrors the federal summariseDay, but WA only has Questions Without Notice
 * data for now (no bills/divisions).
 */
export async function summariseWADay(
  input: WADaySummaryInput
): Promise<{ lede: string; digest: string }> {
  const questionsBlock =
    input.questions.length > 0
      ? input.questions
          .slice(0, 8)
          .map(
            (q) =>
              `- ${q.asker} → ${q.minister || "the minister"}: ${q.subject ?? "No subject"} — ${q.summary ?? "No summary"}`
          )
          .join("\n")
      : "No question time today.";

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: `You are writing a factual daily parliamentary briefing for Western Australians.
Be strictly neutral — report what happened, not whether it was good or bad.
Do not characterise politicians' motives, do not editorialise, do not use loaded language.
Stick to what was asked and answered during Questions Without Notice.
Max 200 words total. No markdown. Always output valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Date: ${input.date}, ${input.chamber}

Questions Without Notice highlights:
${questionsBlock}

Write a daily digest in plain prose:
1. One-sentence lede stating the most significant topic raised, factually.
2. A short paragraph covering the main topics raised in Questions Without Notice and how ministers responded.
Do not express opinions on outcomes. Report facts only.
Output JSON: {"lede": "...", "digest": "..."}`,
      },
    ],
  });

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { lede: "", digest: "" };
  const parsed = JSON.parse(jsonMatch[0]) as { lede?: string; digest?: string };
  return { lede: parsed.lede ?? "", digest: parsed.digest ?? "" };
}
