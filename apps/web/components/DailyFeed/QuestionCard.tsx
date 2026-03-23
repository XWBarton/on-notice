"use client";

import { useState } from "react";
import { PartyBadge } from "@/components/Member/PartyBadge";

interface QuestionCardProps {
  question: {
    id: number;
    subject: string | null;
    question_text: string | null;
    ai_summary: string | null;
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

const PREVIEW_LENGTH = 120;

export function QuestionCard({ question }: QuestionCardProps) {
  const fullText = question.ai_summary ?? question.question_text ?? null;
  const needsTruncation = fullText !== null && fullText.length > PREVIEW_LENGTH;
  const [expanded, setExpanded] = useState(false);

  const displayText = fullText
    ? expanded || !needsTruncation
      ? fullText
      : fullText.slice(0, PREVIEW_LENGTH) + "…"
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
        {question.asker && (
          <>
            <span className="font-medium text-gray-800">{question.asker.name_display}</span>
            {question.asker.parties && <PartyBadge party={question.asker.parties} />}
            <span className="text-gray-400">→</span>
          </>
        )}
        {question.minister && (
          <span className="text-gray-600">
            {question.minister.name_display}
            {question.minister.role && (
              <span className="text-gray-400"> · {question.minister.role}</span>
            )}
          </span>
        )}
      </div>

      {question.subject && (
        <p className="font-medium text-gray-900 text-sm">{question.subject}</p>
      )}

      {displayText && (
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{displayText}</p>
      )}

      {needsTruncation && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 text-xs text-blue-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
