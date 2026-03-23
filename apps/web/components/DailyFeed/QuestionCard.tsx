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

interface QuestionCardProps {
  question: {
    id: number;
    subject: string | null;
    question_text: string | null;
    answer_text?: string | null;
    ai_summary: string | null;
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
        <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
          {question.question_text && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Question</p>
              <p className="text-sm text-gray-600 leading-relaxed">{question.question_text}</p>
            </div>
          )}
          {question.answer_text && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Response</p>
              <p className="text-sm text-gray-600 leading-relaxed">{question.answer_text}</p>
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
