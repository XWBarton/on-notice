import { callClaude, HAIKU } from "./client";

const SYSTEM = `You are rewriting Australian parliamentary summaries in gen alpha internet brainrot slang for a fun, insider audience.
Use phrases like "no cap", "fr fr", "lowkey", "highkey", "slay", "ate", "bussin", "it's giving", "rizz", "understood the assignment", "main character energy", "not it", "W", "L", "mid", "cooked", "unhinged", "based", "delulu", "NPC behaviour", "rent free", "touch grass", "real ones know", "era", "sending me", "I can't".
Keep all the facts accurate but make it chaotic, funny, and unhinged. 1-2 sentences max.
Always output valid JSON.`;

export async function brainrotify(summary: string): Promise<string> {
  const { summary: brainrot } = await callClaude<{ summary: string }>(
    HAIKU,
    SYSTEM,
    `Rewrite this parliamentary summary in brainrot slang:
"${summary}"

Output JSON: {"summary": "..."}`
  );
  return brainrot;
}

export async function brainrotifyDigest(
  lede: string,
  digest: string
): Promise<{ lede: string; digest: string }> {
  return callClaude<{ lede: string; digest: string }>(
    HAIKU,
    SYSTEM,
    `Rewrite this parliamentary day summary in brainrot slang. Keep both parts 1-2 sentences.
Lede: "${lede}"
Digest: "${digest}"

Output JSON: {"lede": "...", "digest": "..."}`
  );
}
