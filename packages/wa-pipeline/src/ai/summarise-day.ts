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
No markdown. Always output valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Date: ${input.date}, ${input.chamber}

Questions Without Notice highlights:
${questionsBlock}

Write a scannable daily digest:
1. "lede": a single sentence naming the most significant topic raised, factually.
2. "points": an array of 3–5 short bullet points, each one distinct topic. Each ~15–25 words: who raised it and the minister's response, in plain factual language. No leading dashes.
Do not express opinions on outcomes. Report facts only.
Output JSON: {"lede": "...", "points": ["...", "..."]}`,
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
  const parsed = JSON.parse(jsonMatch[0]) as { lede?: string; points?: string[]; digest?: string };
  // Bullet points are stored newline-separated in the digest/ai_summary column;
  // the day page renders each line as a list item. Fall back to legacy prose.
  const digest = parsed.points?.length
    ? parsed.points.map((p) => p.replace(/^[-•]\s*/, "").trim()).filter(Boolean).join("\n")
    : parsed.digest ?? "";
  return { lede: parsed.lede ?? "", digest };
}
