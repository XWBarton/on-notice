import { fetchLatestWASitting, WAQuestion } from "./lib/hansard";
import { format, parseISO } from "date-fns";

export const revalidate = 1800;

export default async function WAHomePage() {
  const sitting = await fetchLatestWASitting();

  if (!sitting) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p className="text-lg font-medium">No recent sitting days found.</p>
        <p className="text-sm mt-2">Check back when parliament is sitting.</p>
      </div>
    );
  }

  const dateLabel = format(parseISO(sitting.date), "EEEE d MMMM yyyy");

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-1">{dateLabel}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Questions Without Notice
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Legislative Assembly · {sitting.questions.length} questions
        </p>
      </div>

      <div className="space-y-3">
        {sitting.questions.map((q) => (
          <QuestionCard key={q.number} question={q} />
        ))}
      </div>
    </div>
  );
}

function QuestionCard({ question }: { question: WAQuestion }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <span className="text-xs font-medium text-gray-400 mr-2">
            Q{question.number}
          </span>
          <span className="font-semibold text-gray-900">{question.asker}</span>
          {question.minister && (
            <span className="text-sm text-gray-500 ml-1">
              → {question.minister}
            </span>
          )}
        </div>
        {question.subject && (
          <span className="text-xs text-gray-400 shrink-0 text-right">
            {question.subject}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
        {question.questionText}
      </p>
    </div>
  );
}
