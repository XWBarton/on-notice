"use client";

import { useBrainrot } from "@/context/BrainrotContext";

interface DigestCardProps {
  digest: {
    lede: string | null;
    ai_summary: string | null;
    brainrot_lede?: string | null;
    brainrot_summary?: string | null;
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export function DigestCard({ digest }: DigestCardProps) {
  const { active } = useBrainrot();

  const lede = active && digest.brainrot_lede ? digest.brainrot_lede : digest.lede;
  const summary = active && digest.brainrot_summary ? digest.brainrot_summary : digest.ai_summary;

  if (!lede && !summary) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">AI Summary</p>
      {lede && (
        <p className="font-semibold text-gray-900 mb-2 leading-snug">
          {stripMarkdown(lede)}
        </p>
      )}
      {summary && (
        <p className="text-gray-700 text-sm leading-relaxed">
          {stripMarkdown(summary)}
        </p>
      )}
    </div>
  );
}
