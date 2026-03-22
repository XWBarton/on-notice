interface DigestCardProps {
  digest: {
    lede: string | null;
    ai_summary: string | null;
  };
}

export function DigestCard({ digest }: DigestCardProps) {
  if (!digest.lede && !digest.ai_summary) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {digest.lede && (
        <p className="font-semibold text-gray-900 mb-2">{digest.lede}</p>
      )}
      {digest.ai_summary && (
        <p className="text-gray-600 text-sm leading-relaxed">{digest.ai_summary}</p>
      )}
    </div>
  );
}
