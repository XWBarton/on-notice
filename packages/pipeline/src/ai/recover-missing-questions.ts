/**
 * Recovers questions that OpenAustralia missed by extracting them from
 * ParlView closed captions. Used as a fallback when OA hasn't indexed
 * a question yet.
 *
 * Two-step process:
 *  1. identifyMissingQuestioners — reads the small speaker-call filtered
 *     transcript to find questioner names + approximate timestamps that
 *     aren't in our OA list.
 *  2. extractQuestionFromCaptions — given a targeted ~7-minute window of
 *     raw captions around a specific questioner, extracts the full Q&A.
 *
 * Splitting the steps avoids the truncation problem: the full raw QT
 * captions are too large to send as one blob, but a targeted 7-minute
 * window per missing questioner is compact and accurate.
 */

import { callClaude, SONNET, HAIKU } from "./client";

export interface MissingQuestioner {
  name: string;
  /** Seconds from QT start (T+0) when this questioner was called */
  approxStartSec: number;
  /** Name of the questioner who spoke immediately before this one */
  afterAskerName: string | null;
}

export interface RecoveredQuestion {
  askerName: string;
  ministerName: string | null;
  subject: string | null;
  questionText: string;
  answerText: string;
  afterAskerName: string | null;
}

/**
 * Step 1: read the speaker-call filtered transcript and return any
 * questioners whose names don't appear in the known OA list, along with
 * their approximate T+ timestamps and ordering.
 */
export async function identifyMissingQuestioners(
  speakerCallTranscript: string,
  knownQuestions: { askerName: string | null; electorate?: string | null }[]
): Promise<MissingQuestioner[]> {
  // The Speaker calls House members by seat ("the member for Canberra"), never by name,
  // so the model needs each known asker's electorate to recognise them in the captions.
  const knownNames = knownQuestions
    .filter((q) => q.askerName)
    .map((q) => (q.electorate ? `${q.askerName} (the member for ${q.electorate})` : q.askerName!))
    .join(", ");

  const result = await callClaude<MissingQuestioner[]>(
    HAIKU,
    `You are identifying missing questioners in Australian Parliament Question Time captions.
Return only valid JSON.`,
    `Known questioners already captured from Hansard: ${knownNames || "(none)"}

Read the speaker-call transcript below and identify any questioners who are NOT in the known list above.

A questioner is someone FORMALLY CALLED by the Senate President or House Speaker to ask a question, using phrases like:
- "I give the call to Senator [Name]"
- "Senator [Name], a question" / "Senator [Name]?"
- "I call Senator [Name]"
- The questioner themselves opens with "My question is to the Minister for..."

DO NOT count:
- Senators merely mentioned by name in a minister's answer or in speeches (e.g. "I thank Senator X", "as Senator X said")
- Interjections from senators during another member's speech
- Supplementary questions — only count senators newly called by the President for a primary question
- Anyone who appears to be both the questioner and the minister (self-referential)
- Anyone in the known list, however the chair refers to them — "the member for [electorate]" IS the known questioner with that electorate

For each genuinely missing questioner return:
- name: their full name as best you can determine
- approxStartSec: the T+ seconds value from the transcript line where they were called or started speaking
- afterAskerName: the name of the questioner who spoke immediately before them (from the known list or other recovered questioners), or null if they appear first

Return [] if no missing questioners found.

Transcript:
${speakerCallTranscript}`,
    800
  );

  if (!Array.isArray(result)) return [];
  return result.filter(
    (r) => typeof r.name === "string" && r.name.trim().length > 0 && typeof r.approxStartSec === "number"
  );
}

export interface KnownMember {
  name_last: string;
  name_first: string | null;
  electorate: string | null;
}

const surname = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z' -]/g, "").split(/\s+/).pop() ?? "";

/**
 * Deterministic safety net behind the model in step 1.
 *
 * Captions refer to House members by electorate, Hansard by name — so the model used to
 * report nearly every question as "missing" ("Member for Canberra" vs "Alicia Payne") and
 * the day ended up with 14-odd duplicates. This resolves electorates to members, drops
 * anyone already in Hansard, drops anyone who can't be identified, and refuses the whole
 * batch if it's implausibly large: Hansard missing one or two questions is normal while a
 * day is in proof, missing a third of question time means the detection is wrong.
 */
export function filterMissingQuestioners(
  candidates: MissingQuestioner[],
  knownAskerNames: (string | null)[],
  members: KnownMember[]
): MissingQuestioner[] {
  const knownSurnames = new Set(knownAskerNames.filter(Boolean).map((n) => surname(n!)));
  const byElectorate = new Map(
    members.filter((m) => m.electorate).map((m) => [m.electorate!.trim().toLowerCase(), m])
  );
  const memberSurnames = new Set(members.map((m) => surname(m.name_last)));

  const kept: MissingQuestioner[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    let name = c.name.replace(/^(the\s+)?(hon(ourable)?\.?\s+)?(senator|mr|mrs|ms|dr)\s+/i, "").trim();

    const seat = name.match(/^(?:the\s+)?(?:honourable\s+)?member\s+for\s+(.+)$/i);
    if (seat) {
      const member = byElectorate.get(seat[1].trim().toLowerCase());
      if (!member) {
        console.log(`    Ignoring "${c.name}" — no member holds that electorate`);
        continue;
      }
      name = [member.name_first, member.name_last].filter(Boolean).join(" ");
    }

    const key = surname(name);
    if (!key || knownSurnames.has(key)) {
      console.log(`    Ignoring "${c.name}" — already in Hansard`);
      continue;
    }
    if (members.length > 0 && !memberSurnames.has(key)) {
      console.log(`    Ignoring "${c.name}" — not a member of this chamber`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ ...c, name });
  }

  const known = knownSurnames.size;
  const limit = Math.max(2, Math.ceil(known * 0.3));
  if (known >= 6 && kept.length > limit) {
    console.warn(
      `    Caption check claims ${kept.length} missing questions against ${known} in Hansard — ` +
      `implausible, ignoring all of them`
    );
    return [];
  }
  return kept;
}

/**
 * Step 2: given a targeted ~7-minute window of raw captions around a
 * specific questioner, extract and clean up the full Q&A exchange.
 */
export async function extractQuestionFromCaptions(
  askerName: string,
  rawCaptionsWindow: string
): Promise<Omit<RecoveredQuestion, "afterAskerName"> | null> {
  const result = await callClaude<{ ministerName: string | null; subject: string | null; questionText: string; answerText: string } | null>(
    SONNET,
    `You are reconstructing an Australian Parliament Question Time exchange from auto-generated captions.
The captions contain speech recognition errors — clean them up to produce readable text.
Return only valid JSON.`,
    `Extract the full question and ministerial response for Senator/Member ${askerName} from these captions.
Include the primary question and any supplementary questions with their responses in the answerText.
Exclude interjections and procedural comments from other senators — only include ${askerName}'s question(s) and the minister's responses.
Clean up speech recognition errors to produce readable prose.

Return JSON:
{
  "ministerName": "First Last",
  "subject": "2-4 word topic",
  "questionText": "full primary question text, cleaned up",
  "answerText": "full minister response including responses to supplementaries, cleaned up"
}

If this window does not appear to contain a genuine question from ${askerName}, return null.

Captions:
${rawCaptionsWindow}`,
    2000
  );

  if (!result || typeof result.questionText !== "string") return null;
  return { askerName, ...result };
}
