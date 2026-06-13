interface WADigestCardProps {
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

export function WADigestCard({ digest }: WADigestCardProps) {
  if (!digest.lede && !digest.ai_summary) return null;

  // New digests store key topics as newline-separated bullet points; older ones
  // are a single prose paragraph. Render bullets as a list, prose as a paragraph.
  const points = (digest.ai_summary ?? "")
    .split("\n")
    .map((p) => stripMarkdown(p.replace(/^[-•]\s*/, "")))
    .filter(Boolean);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">AI Summary</p>
      {digest.lede && (
        <p className="font-semibold text-gray-900 mb-2 leading-snug">
          {stripMarkdown(digest.lede)}
        </p>
      )}
      {points.length > 1 ? (
        <ul className="list-disc pl-4 space-y-1.5 marker:text-amber-400">
          {points.map((p, i) => (
            <li key={i} className="text-gray-700 text-sm leading-relaxed">{p}</li>
          ))}
        </ul>
      ) : (
        points.length === 1 && (
          <p className="text-gray-700 text-sm leading-relaxed">{points[0]}</p>
        )
      )}
    </div>
  );
}
