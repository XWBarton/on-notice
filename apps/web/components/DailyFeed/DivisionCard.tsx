interface DivisionCardProps {
  division: {
    id: number;
    subject: string;
    result: string | null;
    ayes_count: number | null;
    noes_count: number | null;
  };
}

export function DivisionCard({ division }: DivisionCardProps) {
  const passed = division.result === "passed";

  return (
    <a
      href={`/divisions/${division.id}`}
      className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 leading-snug flex-1">
          {division.subject}
        </p>
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-1 rounded ${
            passed
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {passed ? "PASSED" : "DEFEATED"}
        </span>
      </div>
      {(division.ayes_count != null || division.noes_count != null) && (
        <div className="flex gap-4 mt-2 text-sm text-gray-500">
          <span>
            <span className="font-medium text-green-700">{division.ayes_count ?? 0}</span> Ayes
          </span>
          <span>
            <span className="font-medium text-red-700">{division.noes_count ?? 0}</span> Noes
          </span>
        </div>
      )}
    </a>
  );
}
