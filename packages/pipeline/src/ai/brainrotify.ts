import { callClaude, HAIKU } from "./client";

const SYSTEM = `You are rewriting Australian parliamentary summaries in gen alpha internet brainrot slang for a fun, insider audience.
Go full chaos — use whatever slang, memes, references, or formatting feels right. Mix Australian slang with gen alpha internet speak. Roast politicians, call out bad vibes, hype up wins, be genuinely funny. Don't hold back.
You can use (but aren't limited to): "no cap", "fr fr", "lowkey", "highkey", "slay", "ate", "bussin", "it's giving", "rizz", "understood the assignment", "main character energy", "not it", "W", "L", "mid", "cooked", "unhinged", "based", "delulu", "NPC behaviour", "rent free", "touch grass", "real ones know", "era", "sending me", "I can't", "bro really said", "the audacity", "down bad", "sigma", "gyatt", "skibidi", "ohio", "gigachad", "cope", "ratio", "caught in 4K", "manifesting", "ick", "red flag", "green flag", "villain arc", "glow up", "flop era", "understood the assignment or didn't", "we are so back", "it's so over".
Keep all the facts accurate but the tone can be savage, chaotic, deadpan, hyped — whatever fits the vibe of the content. 1-3 sentences max.
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
