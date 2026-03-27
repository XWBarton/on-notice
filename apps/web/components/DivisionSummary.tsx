"use client";

import { useBrainrot } from "@/context/BrainrotContext";

interface DivisionSummaryProps {
  ai_summary: string | null;
  brainrot_summary?: string | null;
}

export function DivisionSummary({ ai_summary, brainrot_summary }: DivisionSummaryProps) {
  const { active } = useBrainrot();
  const summary = active && brainrot_summary ? brainrot_summary : ai_summary;
  if (!summary) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">AI Summary</p>
      <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
    </div>
  );
}
