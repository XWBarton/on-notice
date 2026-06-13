"use client";

import { useEffect, useState } from "react";
import { QuestionCard, type TranscriptEntry } from "./QuestionCard";

type Question = {
  id: number;
  is_dorothy_dixer: boolean;
  subject: string | null;
  question_text: string | null;
  answer_text?: string | null;
  ai_summary: string | null;
  brainrot_summary?: string | null;
  transcript_json?: TranscriptEntry[] | null;
  audio_clip_url?: string | null;
  source_note?: string | null;
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

export function QuestionSection({ questions, hansardUrl }: { questions: Question[]; hansardUrl?: string | null }) {
  const [showDixers, setShowDixers] = useState(false);

  const realQuestions = questions.filter((q) => !q.is_dorothy_dixer);
  const dixers = questions.filter((q) => q.is_dorothy_dixer);
  const visible = showDixers ? questions : realQuestions;

  // Deep link to a question (#q-N): reveal it if it's a hidden Dorothy Dixer,
  // then scroll it into view. Client-rendered content means native hash
  // scrolling can fire before the card exists, so we do it ourselves.
  useEffect(() => {
    const match = window.location.hash.match(/^#q-(\d+)$/);
    if (!match) return;
    const n = Number(match[1]);
    if (questions.some((q) => q.id === n && q.is_dorothy_dixer)) setShowDixers(true);
    const id = requestAnimationFrame(() => {
      document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
    // Run once on mount; intentionally not re-running on state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (questions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Question Time
        </h2>
        {dixers.length > 0 && (
          <button
            onClick={() => setShowDixers((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showDixers
              ? `Hide ${dixers.length} Dorothy Dixer${dixers.length !== 1 ? "s" : ""}`
              : `Show ${dixers.length} Dorothy Dixer${dixers.length !== 1 ? "s" : ""}`}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {visible.map((question) => (
          <div key={question.id} className={question.is_dorothy_dixer ? "opacity-60" : ""}>
            {question.is_dorothy_dixer && (
              <p className="text-xs text-gray-400 mb-1 ml-1">Dorothy Dixer</p>
            )}
            <QuestionCard question={question} hansardUrl={hansardUrl} />
          </div>
        ))}
      </div>
    </section>
  );
}
