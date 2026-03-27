"use client";

import { PartyBadge } from "@/components/Member/PartyBadge";
import { useBrainrot } from "@/context/BrainrotContext";

interface BillCardProps {
  bill: {
    id: number;
    short_title: string;
    bill_stage: string | null;
    ai_summary: string | null;
    brainrot_summary?: string | null;
    source_url: string | null;
    members?: {
      name_display: string;
      party_id: string | null;
      parties?: { name: string; short_name: string; colour_hex: string | null } | null;
    } | null;
  };
}

export function BillCard({ bill }: BillCardProps) {
  const { active } = useBrainrot();
  const summary = active && bill.brainrot_summary ? bill.brainrot_summary : bill.ai_summary;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 leading-snug">{bill.short_title}</h3>
          {bill.members && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">
                Introduced by {bill.members.name_display}
              </span>
              {bill.members.parties && (
                <PartyBadge party={bill.members.parties} />
              )}
            </div>
          )}
          {summary && (
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">{summary}</p>
          )}
        </div>
        {bill.bill_stage && (
          <span className="shrink-0 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded font-medium">
            {formatStage(bill.bill_stage)}
          </span>
        )}
      </div>
      {bill.source_url && (
        <a
          href={bill.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-xs text-blue-600 hover:underline"
        >
          View on APH →
        </a>
      )}
    </div>
  );
}

function formatStage(stage: string) {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
