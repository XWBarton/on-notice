"use client";
import type { TopicCluster } from "@/lib/types";

interface Props {
  topics: TopicCluster[];
  className?: string;
}

export default function TopicLegend({ topics, className }: Props) {
  if (topics.length === 0) return null;

  const sorted = [...topics].sort((a, b) => b.nodeIds.length - a.nodeIds.length);

  return (
    <div
      className={`bg-white/90 backdrop-blur rounded-lg border border-gray-200 p-3 shadow-sm max-w-[200px] ${className ?? ""}`}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Topics</p>

      <div className="space-y-1.5">
        {sorted.slice(0, 10).map((topic) => (
          <div key={topic.policyId} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: topic.color }}
            />
            <span className="text-xs text-gray-700 truncate">{topic.name}</span>
            <span className="text-xs text-gray-400 ml-auto tabular-nums flex-shrink-0">
              {topic.nodeIds.length}
            </span>
          </div>
        ))}
        {sorted.length > 10 && (
          <p className="text-xs text-gray-400">+{sorted.length - 10} more</p>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2.5 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full border-[1.5px] border-gray-400 bg-white" />
          Bill
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          Passed
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          Defeated
        </div>
      </div>
    </div>
  );
}
