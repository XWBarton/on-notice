interface DigestCardProps {
  digest: {
    lede: string | null;
    ai_summary: string | null;
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
  if (!digest.lede && !digest.ai_summary) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      {digest.lede && (
        <p className="font-semibold text-gray-900 mb-2 leading-snug">
          {stripMarkdown(digest.lede)}
        </p>
      )}
      {digest.ai_summary && (
        <p className="text-gray-700 text-sm leading-relaxed">
          {stripMarkdown(digest.ai_summary)}
        </p>
      )}
    </div>
  );
}
