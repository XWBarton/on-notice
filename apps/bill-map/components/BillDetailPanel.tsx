"use client";
import type { GraphNode } from "@/lib/types";

interface Props {
  node: GraphNode | null;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BillDetailPanel({ node, onClose }: Props) {
  if (!node) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-20 flex flex-col">
      <div className="flex items-start justify-between p-4 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-900 leading-snug pr-2">
          {node.type === "bill" ? node.shortTitle : node.name}
        </h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 text-xl leading-none mt-0.5"
          aria-label="Close panel"
        >
          ×
        </button>
      </div>

      <div className="p-4 space-y-4 text-sm flex-1">
        {/* Bill details */}
        {node.type === "bill" && (
          <>
            <div className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              Bill
            </div>

            {node.status && (
              <Field label="Status" value={node.status} />
            )}
            {node.sponsor && (
              <Field label="Sponsor" value={node.sponsor} />
            )}
            {node.portfolio && (
              <Field label="Portfolio" value={node.portfolio} />
            )}
            {node.house && (
              <Field
                label="House"
                value={node.house === "representatives" ? "House of Representatives" : "Senate"}
              />
            )}
            {node.introducedDate && (
              <Field label="Introduced" value={formatDate(node.introducedDate)} />
            )}
            {node.parliamentNumber && (
              <Field label="Parliament" value={`${node.parliamentNumber}th Parliament`} />
            )}
            {node.topicName && (
              <Field label="Topic" value={node.topicName} />
            )}

            <div className="pt-1 space-y-2">
              {node.aphBillId && (
                <a
                  href={`https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results?bId=${node.aphBillId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-blue-600 hover:underline"
                >
                  View on APH →
                </a>
              )}
            </div>
          </>
        )}

        {/* Division details */}
        {node.type === "division" && (
          <>
            <div className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
              Division
            </div>

            <Field label="Date" value={formatDate(node.date)} />
            <Field
              label="House"
              value={node.house === "representatives" ? "House of Representatives" : "Senate"}
            />
            <Field label="Outcome" value={node.outcome} />

            <div>
              <span className="text-xs text-gray-400 uppercase tracking-wide">Vote</span>
              <div className="flex gap-4 mt-1 text-sm font-medium">
                <span className="text-green-700">Ayes {node.ayeVotes}</span>
                <span className="text-red-700">Noes {node.noVotes}</span>
              </div>
              {node.ayeVotes + node.noVotes > 0 && (
                <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${(node.ayeVotes / (node.ayeVotes + node.noVotes)) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <a
              href={`https://theyvoteforyou.org.au/divisions/${node.house}/${node.date.slice(0, 7).replace("-", "/")}/${node.tvfyId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-blue-600 hover:underline pt-1"
            >
              View on They Vote For You →
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <p className="text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
