/**
 * Dorothy Dixer detection and question enrichment.
 *
 * Primary rule: asker.party == minister.party AND minister is in government.
 * AI fallback: used only for ambiguous cases (crossbench, independents).
 */

import { db } from "../db/client";
import { detectDorothyDixerAI } from "../ai/detect-dorothy-dixer";

interface MemberRecord {
  id: string;
  party_id: string | null;
  name_last: string;
}

// In-memory cache, populated once per run
let memberCache: Map<string, MemberRecord> | null = null;

async function getMemberCache(parliamentId: string): Promise<Map<string, MemberRecord>> {
  if (memberCache) return memberCache;

  const { data } = await db
    .from("members")
    .select("id, party_id, name_last")
    .eq("parliament_id", parliamentId)
    .eq("is_active", true);

  memberCache = new Map((data ?? []).map((m) => [normalise(m.name_last), m]));
  return memberCache;
}

export function resetMemberCache() {
  memberCache = null;
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

  const asker = askerName ? lookupMember(cache, askerName) : null;
  const minister = ministerName ? lookupMember(cache, ministerName) : null;

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
  cache: Map<string, MemberRecord>,
  fullName: string
): MemberRecord | undefined {
  // Try exact last name match first
  const lastName = extractLastName(fullName);
  return cache.get(normalise(lastName));
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
