/**
 * Dorothy Dixer detection and question enrichment.
 *
 * Primary rule: asker.party == minister.party AND minister is in government.
 * Text fallback: asker is a government member + question addresses "the minister" — catches
 *   cases where OpenAustralia returns no speaker metadata for the minister's response.
 * AI fallback: used only for ambiguous cases (crossbench, independents).
 */

import { db } from "../db/client";
import { detectDorothyDixerAI } from "../ai/detect-dorothy-dixer";

interface MemberRecord {
  id: string;
  party_id: string | null;
  name_last: string;
  name_first: string | null;
}

// In-memory cache: last_name → all members with that last name
let memberCache: Map<string, MemberRecord[]> | null = null;

async function getMemberCache(parliamentId: string): Promise<Map<string, MemberRecord[]>> {
  if (memberCache) return memberCache;

  const { data } = await db
    .from("members")
    .select("id, party_id, name_last, name_first")
    .eq("parliament_id", parliamentId);

  memberCache = new Map();
  for (const m of data ?? []) {
    const key = normalise(m.name_last);
    const existing = memberCache.get(key) ?? [];
    existing.push(m);
    memberCache.set(key, existing);
  }
  return memberCache;
}

export function resetMemberCache() {
  memberCache = null;
}

/**
 * Parse a raw rewritexml speaker name into first/last name components.
 * "Senator CASH"          → { firstName: null,     lastName: "CASH" }
 * "Senator BARBARA POCOCK" → { firstName: "BARBARA", lastName: "POCOCK" }
 * "The PRESIDENT"         → { firstName: null,     lastName: "PRESIDENT" }
 */
function parseXmlSpeakerName(raw: string): { firstName: string | null; lastName: string } {
  const withoutTitle = raw.replace(/^(Senator|The|Member)\s+/i, "").trim();
  const parts = withoutTitle.split(/\s+/);
  if (parts.length <= 1) return { firstName: null, lastName: parts[0] ?? raw };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/**
 * Returns a lookup function that resolves raw rewritexml speaker names
 * (e.g. "Senator BARBARA POCOCK") to party short_name and display name.
 * Uses a fresh DB query so party short_names come from the parties table directly.
 */
export async function getMemberLookup(parliamentId: string): Promise<
  (rawSpeakerName: string) => { partyShortName: string | null; displayName: string | null }
> {
  const { data } = await db
    .from("members")
    .select("name_last, name_first, parties(short_name)")
    .eq("parliament_id", parliamentId);

  type Entry = { name_first: string | null; displayName: string; partyShortName: string | null };
  const byLastName = new Map<string, Entry[]>();

  for (const m of data ?? []) {
    const key = normalise(m.name_last);
    const existing = byLastName.get(key) ?? [];
    existing.push({
      name_first: m.name_first ?? null,
      displayName: [m.name_first, m.name_last].filter(Boolean).join(" "),
      partyShortName: (m.parties as unknown as { short_name: string } | null)?.short_name ?? null,
    });
    byLastName.set(key, existing);
  }

  return (rawSpeakerName: string) => {
    const { firstName, lastName } = parseXmlSpeakerName(rawSpeakerName);
    const candidates = byLastName.get(normalise(lastName));
    if (!candidates || candidates.length === 0) return { partyShortName: null, displayName: null };

    // Disambiguate by first name when multiple members share a last name
    if (candidates.length > 1 && firstName) {
      const match = candidates.find((c) =>
        c.name_first?.toLowerCase().startsWith(firstName.toLowerCase().slice(0, 3)) ?? false
      );
      if (match) return { partyShortName: match.partyShortName, displayName: match.displayName };
    }

    return { partyShortName: candidates[0].partyShortName, displayName: candidates[0].displayName };
  };
}

/**
 * Detect if a question is a Dorothy Dixer.
 *
 * Returns: { isDorothyDixer, askerMemberId, ministerMemberId }
 */
export async function classifyQuestion(
  askerName: string | null,
  ministerName: string | null,
  parliamentId: string,
  governmentParties: string[],
  questionText: string
): Promise<{ isDorothyDixer: boolean; askerMemberId: string | null; ministerMemberId: string | null }> {
  const cache = await getMemberCache(parliamentId);

  const asker = askerName ? lookupMember(cache, askerName, null) : null;
  const minister = ministerName ? lookupMember(cache, ministerName, null) : null;

  const askerParty = asker?.party_id ?? null;
  const ministerParty = minister?.party_id ?? null;

  // Clear Dorothy Dixer: both same party AND minister is in government
  if (
    askerParty &&
    ministerParty &&
    askerParty === ministerParty &&
    governmentParties.includes(ministerParty)
  ) {
    return {
      isDorothyDixer: true,
      askerMemberId: asker?.id ?? null,
      ministerMemberId: minister?.id ?? null,
    };
  }

  // Clear opposition/crossbench question
  if (
    askerParty &&
    ministerParty &&
    askerParty !== ministerParty &&
    !governmentParties.includes(askerParty)
  ) {
    return {
      isDorothyDixer: false,
      askerMemberId: asker?.id ?? null,
      ministerMemberId: minister?.id ?? null,
    };
  }

  // Fallback: if minister name is missing but asker is a government member and the question
  // text addresses a government minister, it's almost certainly a dixer. This handles cases
  // where OpenAustralia returns no speaker metadata for the minister's response.
  if (!ministerName && askerParty && governmentParties.includes(askerParty)) {
    if (/\bmy\s+question\s+is\s+to\s+the\b/i.test(questionText)) {
      return {
        isDorothyDixer: true,
        askerMemberId: asker?.id ?? null,
        ministerMemberId: null,
      };
    }
  }

  // Can't classify without at least asker info — skip AI
  if (!askerName || !ministerName) {
    return {
      isDorothyDixer: false,
      askerMemberId: asker?.id ?? null,
      ministerMemberId: minister?.id ?? null,
    };
  }

  // Ambiguous — use AI fallback
  const aiResult = await detectDorothyDixerAI({
    askerName: askerName ?? "Unknown",
    askerParty: askerParty ?? "Unknown",
    ministerName: ministerName ?? "Unknown",
    ministerParty: ministerParty ?? "Unknown",
    governmentParties,
    questionText,
  });

  return {
    isDorothyDixer: aiResult.isDorothyDixer,
    askerMemberId: asker?.id ?? null,
    ministerMemberId: minister?.id ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lookupMember(
  cache: Map<string, MemberRecord[]>,
  fullName: string,
  partyHint: string | null
): MemberRecord | undefined {
  const lastName = extractLastName(fullName);
  const candidates = cache.get(normalise(lastName));
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Multiple members share this last name — try to disambiguate by first name
  const firstName = extractFirstName(fullName);
  if (firstName) {
    const firstMatch = candidates.find(
      (m) => m.name_first?.toLowerCase().startsWith(firstName.toLowerCase().slice(0, 2)) ?? false
    );
    if (firstMatch) return firstMatch;
  }

  // Fall back to party hint if provided
  if (partyHint) {
    const partyMatch = candidates.find((m) => m.party_id === partyHint);
    if (partyMatch) return partyMatch;
  }

  return candidates[0];
}

function extractFirstName(name: string): string | null {
  // "Rick Wilson" → "Rick"; "Wilson, Rick" → "Rick"; "WILSON R" → "R"
  const commaMatch = name.match(/^[A-Z][A-Z\s-]+,\s*(.+)/);
  if (commaMatch) return commaMatch[1].trim().split(/\s+/)[0];
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[0] : null;
}

function extractLastName(name: string): string {
  // "Cook" or "Cook, Roger" or "COOK R H" or "Roger Cook"
  const commaMatch = name.match(/^([A-Z][A-Z\s-]+),/);
  if (commaMatch) return commaMatch[1].trim();

  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function normalise(s: string): string {
  return s.toUpperCase().trim().replace(/[^A-Z]/g, "");
}
