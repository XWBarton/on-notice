"use client";

import { useState } from "react";
import { QuestionCard } from "./QuestionCard";

type Question = {
  id: number;
  is_dorothy_dixer: boolean;
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

export function QuestionSection({ questions }: { questions: Question[] }) {
  const [showDixers, setShowDixers] = useState(false);

  const realQuestions = questions.filter((q) => !q.is_dorothy_dixer);
  const dixers = questions.filter((q) => q.is_dorothy_dixer);
  const visible = showDixers ? questions : realQuestions;

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
            <QuestionCard question={question} />
          </div>
        ))}
      </div>
    </section>
  );
}
