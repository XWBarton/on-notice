"use client";

import { useState } from "react";
import { PartyBadge, TranscriptBlock, AudioClipPlayer, CopyLinkButton } from "./cardBits";

interface WAQuestionCardProps {
  question: {
    question_number: number;
    subject: string | null;
    question_text: string | null;
    answer_text: string | null;
    ai_summary: string | null;
    minister_name: string | null;
    audio_clip_url: string | null;
    asker: {
      name_display: string;
      party_id: string | null;
      parties: { short_name: string; colour_hex: string } | null;
    } | null;
    minister: {
      name_display: string;
      parties: { short_name: string; colour_hex: string } | null;
    } | null;
  };
}

export function WAQuestionCard({ question }: WAQuestionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const party = question.asker?.parties;
  const hasTranscript = !!(question.question_text || question.answer_text);

  return (
    <div id={`q-${question.question_number}`} className="bg-white border border-gray-200 rounded-lg p-4 scroll-mt-20 target:ring-2 target:ring-[#FFD200] target:border-[#FFD200]">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-sm mb-1">
            <span className="text-xs font-medium text-gray-400">Q{question.question_number}</span>
            {party && <PartyBadge short_name={party.short_name} colour_hex={party.colour_hex} />}
            <span className="font-medium text-gray-800">
              {question.asker?.name_display ?? "Unknown"}
            </span>
            {(question.minister || question.minister_name) && (
              <>
                <span className="text-gray-400">→</span>
                {question.minister ? (
                  <>
                    {question.minister.parties && (
                      <PartyBadge
                        short_name={question.minister.parties.short_name}
                        colour_hex={question.minister.parties.colour_hex}
                      />
                    )}
                    <span className="text-gray-600">{question.minister.name_display}</span>
                  </>
                ) : (
                  <span className="text-gray-600">{question.minister_name}</span>
                )}
              </>
            )}
          </div>

          {question.minister && question.minister_name && (
            <p className="text-xs text-gray-400 mb-1">Asked of {question.minister_name}</p>
          )}

          {question.subject && (
            <p className="font-medium text-gray-900 text-sm">{question.subject}</p>
          )}
        </div>

        {question.audio_clip_url && (
          <div className="shrink-0">
            <AudioClipPlayer url={question.audio_clip_url} label="Play Q&A" />
          </div>
        )}
      </div>

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

      <div className="mt-2 flex items-center gap-4">
        {hasTranscript && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
          >
            {expanded ? "Hide transcript" : "Show quoted question & response"}
          </button>
        )}
        <CopyLinkButton
          anchorId={`q-${question.question_number}`}
          snippet={(() => {
            const people = [question.asker?.name_display, question.minister?.name_display ?? question.minister_name]
              .filter(Boolean)
              .join(" → ");
            return [people, question.subject].filter(Boolean).join(people && question.subject ? " — " : "") || null;
          })()}
        />
      </div>
    </div>
  );
}
