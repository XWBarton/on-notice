"use client";

import { useState } from "react";
import { PartyBadge } from "@/components/Member/PartyBadge";

// Maps raw OA party strings (and normalized short names) → display badge
const PARTY_LOOKUP: Record<string, { short_name: string; colour: string }> = {
  // Normalised short names
  ALP:  { short_name: "ALP",  colour: "#D34547" },
  LIB:  { short_name: "LIB",  colour: "#2A4E97" },
  LNP:  { short_name: "L/NP", colour: "#244B77" },
  NAT:  { short_name: "NAT",  colour: "#406D50" },
  GRN:  { short_name: "GRN",  colour: "#3B874A" },
  ON:   { short_name: "ON",   colour: "#E1733C" },
  TEAL: { short_name: "TEAL", colour: "#4B9FB4" },
  IND:  { short_name: "IND",  colour: "#757575" },
  KAP:  { short_name: "KAP",  colour: "#795548" },
  UAP:  { short_name: "UAP",  colour: "#FDD835" },
  CA:   { short_name: "CA",   colour: "#4B9FB4" },
  // Raw OA variants
  "Australian Labor Party": { short_name: "ALP", colour: "#D34547" },
  "Labor":                  { short_name: "ALP", colour: "#D34547" },
  "Liberal Party of Australia": { short_name: "LIB", colour: "#2A4E97" },
  "Liberal Party":          { short_name: "LIB", colour: "#2A4E97" },
  "Liberal":                { short_name: "LIB", colour: "#2A4E97" },
  "LIBERA":                 { short_name: "LIB", colour: "#2A4E97" },
  "Liberal National Party": { short_name: "L/NP", colour: "#244B77" },
  "The Nationals":          { short_name: "NAT", colour: "#406D50" },
  "National Party":         { short_name: "NAT", colour: "#406D50" },
  "National Party of Australia": { short_name: "NAT", colour: "#406D50" },
  "National":               { short_name: "NAT", colour: "#406D50" },
  "NATION":                 { short_name: "NAT", colour: "#406D50" },
  "Australian Greens":      { short_name: "GRN", colour: "#3B874A" },
  "Greens":                 { short_name: "GRN", colour: "#3B874A" },
  "Pauline Hanson's One Nation": { short_name: "ON", colour: "#E1733C" },
  "One Nation":             { short_name: "ON",  colour: "#E1733C" },
  "PAULIN":                 { short_name: "ON",  colour: "#E1733C" },
  "Independent":            { short_name: "IND", colour: "#757575" },
  "Climate 200":            { short_name: "TEAL", colour: "#4B9FB4" },
  "Katter's Australian Party": { short_name: "KAP", colour: "#795548" },
  "United Australia Party": { short_name: "UAP", colour: "#FDD835" },
};

function partyBadgeProps(raw: string | null | undefined) {
  if (!raw) return null;
  const p = PARTY_LOOKUP[raw];
  return p ? { short_name: p.short_name, colour_hex: p.colour } : { short_name: raw, colour_hex: "#757575" };
}

export interface TranscriptEntry {
  type: "speech" | "interjection" | "procedural";
  speaker: string | null;
  party: string | null;
  text: string;
}

interface QuestionCardProps {
  question: {
    id: number;
    subject: string | null;
    question_text: string | null;
    answer_text?: string | null;
    ai_summary: string | null;
    transcript_json?: TranscriptEntry[] | null;
    asker_name?: string | null;
    asker_party?: string | null;
    minister_name?: string | null;
    minister_party?: string | null;
    asker?: {
      name_display: string;
      party_id: string | null;
      parties?: { short_name: string; colour_hex: string | null } | null;
    } | null;
    minister?: {
      name_display: string;
      role: string | null;
    } | null;
  };
}

// Lines that are Speaker/Chair procedural interventions
const SPEAKER_PATTERNS = [
  /^Order[!.]*/i,
  /^Resume your seat/i,
  /^The (minister|member|manager|leader|honourable member|house|senator)\b/i,
  /^(Honourable|Opposition|Government|All) members?/i,
  /^(Senator|Member) for \w+ (will|would|has|is)\b/i,
  /^I (now )?call (on )?the/i,
  /^Thanks?,\s*(member|senator|minister|mr|ms|mrs|dr)/i,
  /^That (is|was) the (question|answer|end)/i,
];

// Lines that are interjections from the floor
const INTERJECTION_PATTERNS = [
  /interject/i,
  /[—–]$/, // sentence cut off with em-dash
  /^You\b.{0,40}[!.]$/, // short accusatory "You lied", "You said", etc.
  /^[A-Z][a-z]+ members?:/,
];

function classifyLine(s: string): "speaker" | "interjection" | "speech" {
  const t = s.trim();
  if (!t) return "speech";
  if (SPEAKER_PATTERNS.some((p) => p.test(t))) return "speaker";
  if (INTERJECTION_PATTERNS.some((p) => p.test(t))) return "interjection";
  return "speech";
}

function TranscriptText({ text }: { text: string }) {
  // Pipeline joins answer rows with \n\n — split on any newline sequence
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const kind = classifyLine(line);
        if (kind === "speaker") {
          return (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 italic leading-relaxed">
              {line}
            </p>
          );
        }
        if (kind === "interjection") {
          return (
            <p key={i} className="text-xs text-gray-400 italic leading-relaxed pl-2 border-l-2 border-gray-200">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="text-sm text-gray-600 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function StructuredTranscript({ entries }: { entries: TranscriptEntry[] }) {
  // Group consecutive entries by speaker to show speaker attribution once
  const groups: { speaker: string | null; party: string | null; entries: TranscriptEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (entry.type !== "speech") {
      // Interjections and procedurals always get their own slot
      groups.push({ speaker: entry.speaker, party: entry.party, entries: [entry] });
    } else if (last && last.entries[last.entries.length - 1].type === "speech" && last.speaker === entry.speaker) {
      last.entries.push(entry);
    } else {
      groups.push({ speaker: entry.speaker, party: entry.party, entries: [entry] });
    }
  }

  return (
    <div className="space-y-2">
      {groups.map((group, gi) => {
        const firstEntry = group.entries[0];
        if (firstEntry.type === "procedural") {
          return (
            <p key={gi} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-0.5 italic leading-relaxed">
              {firstEntry.text}
            </p>
          );
        }
        if (firstEntry.type === "interjection") {
          return (
            <p key={gi} className="text-xs text-gray-400 italic leading-relaxed pl-2 border-l-2 border-gray-200">
              {group.speaker && <span className="font-medium not-italic text-gray-500">{group.speaker}: </span>}
              {firstEntry.text}
            </p>
          );
        }
        // Speech group
        return (
          <div key={gi} className="space-y-1">
            {group.speaker && (
              <p className="text-xs font-semibold text-gray-500">
                {group.speaker}
                {group.party && (() => {
                  const p = partyBadgeProps(group.party);
                  return p ? <span className="ml-1 inline-flex"><PartyBadge party={p} /></span> : null;
                })()}
              </p>
            )}
            {group.entries.map((e, ei) => (
              <p key={ei} className="text-sm text-gray-600 leading-relaxed">{e.text}</p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function QuestionCard({ question }: QuestionCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasTranscript = !!(question.question_text || question.answer_text);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
        {(question.asker || question.asker_name) && (
          <>
            <span className="font-medium text-gray-800">
              {question.asker?.name_display ?? question.asker_name}
            </span>
            {(() => {
              const raw = question.asker?.parties?.short_name ?? question.asker_party;
              const p = partyBadgeProps(raw);
              return p ? <PartyBadge party={p} /> : null;
            })()}
            <span className="text-gray-400">→</span>
          </>
        )}
        {(question.minister || question.minister_name) && (
          <span className="flex items-center gap-1.5 text-gray-600">
            {question.minister?.name_display ?? question.minister_name}
            {partyBadgeProps(question.minister_party) && (
              <PartyBadge party={partyBadgeProps(question.minister_party)!} />
            )}
            {question.minister?.role && (
              <span className="text-gray-400"> · {question.minister.role}</span>
            )}
          </span>
        )}
      </div>

      {question.subject && (
        <p className="font-medium text-gray-900 text-sm">{question.subject}</p>
      )}

      {question.ai_summary && (
        <div className="mt-1.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">AI Summary</p>
          <p className="text-sm text-gray-500 leading-relaxed">{question.ai_summary}</p>
        </div>
      )}

      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {question.transcript_json && question.transcript_json.length > 0 ? (
            <StructuredTranscript entries={question.transcript_json} />
          ) : (
            <div className="space-y-3">
              {question.question_text && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Question</p>
                  <TranscriptText text={question.question_text} />
                </div>
              )}
              {question.answer_text && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Response</p>
                  <TranscriptText text={question.answer_text} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasTranscript && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
        >
          {expanded ? "Hide transcript" : "Show quoted question & response"}
        </button>
      )}
    </div>
  );
}
