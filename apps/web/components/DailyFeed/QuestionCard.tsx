import { PartyBadge } from "@/components/Member/PartyBadge";

interface QuestionCardProps {
  question: {
    id: number;
    subject: string | null;
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

export function QuestionCard({ question }: QuestionCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-2 flex-wrap">
        {question.asker && (
          <>
            <span className="text-sm text-gray-700 font-medium">
              {question.asker.name_display}
            </span>
            {question.asker.parties && (
              <PartyBadge party={question.asker.parties} />
            )}
            <span className="text-sm text-gray-400">→</span>
          </>
        )}
        {question.minister && (
          <span className="text-sm text-gray-700">
            {question.minister.name_display}
            {question.minister.role && (
              <span className="text-gray-400"> ({question.minister.role})</span>
            )}
          </span>
        )}
      </div>
      {question.subject && (
        <p className="text-sm font-medium text-gray-900 mt-1">{question.subject}</p>
      )}
      {question.ai_summary && (
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{question.ai_summary}</p>
      )}
    </div>
  );
}
