"use client";

import { useState } from "react";

interface WAQuestionCardProps {
  question: {
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    asker: {
      name_display: string;
      party_id: string | null;
      parties: { short_name: string; colour_hex: string } | null;
    } | null;
  };
}

function PartyBadge({ short_name, colour_hex }: { short_name: string; colour_hex: string }) {
  return (
    <span
      className="text-xs font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: `${colour_hex}20`, color: colour_hex }}
    >
      {short_name}
    </span>
  );
}

function TranscriptBlock({ label, text }: { label: string; text: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <p key={i} className="text-sm text-gray-600 leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  );
}

export function WAQuestionCard({ question }: WAQuestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const party = question.asker?.parties;
  const hasTranscript = !!(question.question_text || question.answer_text);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
        <span className="text-xs font-medium text-gray-400">Q{question.question_number}</span>
        {party && <PartyBadge short_name={party.short_name} colour_hex={party.colour_hex} />}
        <span className="font-medium text-gray-800">
          {question.asker?.name_display ?? "Unknown"}
        </span>
        {question.minister_name && (
          <>
            <span className="text-gray-400">→</span>
            <span className="text-gray-600">{question.minister_name}</span>
          </>
        )}
      </div>

      {question.subject && (
        <p className="font-medium text-gray-900 text-sm mb-1.5">{question.subject}</p>
      )}

      {question.ai_summary && (
        <div className="mt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">AI Summary</p>
          <p className="text-sm text-gray-500 leading-relaxed">{question.ai_summary}</p>
        </div>
      )}

      {expanded && hasTranscript && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
          {question.question_text && (
            <TranscriptBlock label="Question" text={question.question_text} />
          )}
          {question.answer_text && (
            <TranscriptBlock label="Response" text={question.answer_text} />
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
