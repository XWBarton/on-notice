"use client";

import { useState } from "react";
import { PartyBadge } from "@/components/Member/PartyBadge";

const PARTY_COLOURS: Record<string, string> = {
  ALP: "#D34547",
  LIB: "#2A4E97",
  LNP: "#244B77",
  NAT: "#406D50",
  GRN: "#3B874A",
  ON:  "#E1733C",
  TEAL: "#4B9FB4",
  IND: "#757575",
  KAP: "#795548",
  UAP: "#FDD835",
  CA:  "#4B9FB4",
};

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
            {question.asker?.parties && <PartyBadge party={question.asker.parties} />}
            {!question.asker?.parties && question.asker_party && (
              <PartyBadge party={{ short_name: question.asker_party, colour_hex: PARTY_COLOURS[question.asker_party] ?? null }} />
            )}
            <span className="text-gray-400">→</span>
          </>
        )}
        {(question.minister || question.minister_name) && (
          <span className="flex items-center gap-1.5 text-gray-600">
            {question.minister?.name_display ?? question.minister_name}
            {question.minister_party && (
              <PartyBadge party={{ short_name: question.minister_party, colour_hex: PARTY_COLOURS[question.minister_party] ?? null }} />
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
