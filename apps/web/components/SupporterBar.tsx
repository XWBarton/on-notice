const GOAL = 30; // AUD per month
const KOFI_URL = "https://ko-fi.com/xbarton";

interface SupporterBarProps {
  totalMonthly: number;
  supporterCount: number;
}

export function SupporterBar({ totalMonthly, supporterCount }: SupporterBarProps) {
  const pct = Math.min(100, Math.round((totalMonthly / GOAL) * 100));

  return (
    <div className="border-t border-gray-100 bg-white px-4 py-4 mt-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
          <span>
            <span className="font-semibold text-gray-700">{supporterCount}</span>{" "}
            {supporterCount === 1 ? "supporter" : "supporters"} · ${totalMonthly.toFixed(0)}/month
          </span>
          <span className="text-gray-400">goal ${GOAL}/month</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-400">
          On Notice is free and independent.{" "}
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-600 hover:underline font-medium"
          >
            Support it for $2/month
          </a>{" "}
          to keep it running.
        </p>
      </div>
    </div>
  );
}
