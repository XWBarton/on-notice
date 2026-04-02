"use client";

import { useState } from "react";
import Link from "next/link";
import { parseISO, formatDistanceToNowStrict } from "date-fns";
import { PartyBadge } from "@/components/Member/PartyBadge";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BillRow = {
  id: number;
  short_title: string;
  bill_stage: string | null;
  ai_summary: string | null;
  introduced_date: string | null;
  parliament_id: string;
  sitting_days: { sitting_date: string } | null;
  members: {
    name_display: string;
    party_id: string | null;
    parties?: { name: string; short_name: string; colour_hex: string | null } | null;
  } | null;
};

// ─── Pipeline definition ─────────────────────────────────────────────────────

type PipelineStep = {
  key: string;       // matches bill_stage value
  label: string;
  shortLabel: string;
};

const HOUSE_STEPS: PipelineStep[] = [
  { key: "first_reading",           label: "First Reading",            shortLabel: "1st" },
  { key: "second_reading",          label: "Second Reading",           shortLabel: "2nd" },
  { key: "second_reading_amendment",label: "2nd Reading Amendment",    shortLabel: "2nd Amend" },
  { key: "consideration_in_detail", label: "Consideration in Detail",  shortLabel: "Detail" },
  { key: "third_reading",           label: "Third Reading",            shortLabel: "3rd" },
];

const SENATE_STEPS: PipelineStep[] = [
  { key: "senate_first_reading",  label: "First Reading",          shortLabel: "1st" },
  { key: "senate_second_reading", label: "Second Reading",         shortLabel: "2nd" },
  { key: "committee_of_whole",    label: "Committee of the Whole", shortLabel: "Committee" },
  { key: "senate_third_reading",  label: "Third Reading",          shortLabel: "3rd" },
];

const FINAL_STEPS: PipelineStep[] = [
  { key: "passed",       label: "Passed Both Chambers", shortLabel: "Passed" },
  { key: "royal_assent", label: "Royal Assent",          shortLabel: "Assent" },
];

const TERMINAL_STEPS: PipelineStep[] = [
  { key: "defeated",  label: "Defeated",  shortLabel: "Defeated" },
  { key: "withdrawn", label: "Withdrawn", shortLabel: "Withdrawn" },
  { key: "lapsed",    label: "Lapsed",    shortLabel: "Lapsed" },
];

// Determine which pipeline step key a bill belongs to.
// Senate stages for House-originated bills are senate_* synthetic keys.
function billStepKey(bill: BillRow): string {
  const s = bill.bill_stage;
  if (!s) return "unknown";
  // committee_of_whole is always a Senate stage
  if (s === "committee_of_whole") return "committee_of_whole";
  // For Senate-originated bills, first/second/third_reading are Senate stages
  if (bill.parliament_id === "fed_sen") {
    if (s === "first_reading") return "senate_first_reading";
    if (s === "second_reading" || s === "second_reading_amendment") return "senate_second_reading";
    if (s === "third_reading") return "senate_third_reading";
  }
  return s;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BillsExplorer({ bills }: { bills: BillRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  // Build count map
  const counts = new Map<string, BillRow[]>();
  for (const bill of bills) {
    const key = billStepKey(bill);
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key)!.push(bill);
  }

  const selectedBills = selected ? (counts.get(selected) ?? []) : [];
  const selectedStep = [
    ...HOUSE_STEPS, ...SENATE_STEPS, ...FINAL_STEPS, ...TERMINAL_STEPS,
  ].find((s) => s.key === selected);

  function handleSelect(key: string) {
    setSelected((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-6">
      {/* Pipeline graphic */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">

        {/* House row */}
        <PipelineRow
          label="House"
          color="#006945"
          steps={HOUSE_STEPS}
          counts={counts}
          selected={selected}
          onSelect={handleSelect}
        />

        {/* Arrow between chambers */}
        <div className="flex items-center gap-2 pl-14">
          <div className="h-px flex-1 border-t border-dashed border-gray-300" />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">passes to Senate</span>
          <div className="h-px flex-1 border-t border-dashed border-gray-300" />
        </div>

        {/* Senate row */}
        <PipelineRow
          label="Senate"
          color="#C1121F"
          steps={SENATE_STEPS}
          counts={counts}
          selected={selected}
          onSelect={handleSelect}
        />

        {/* Final / terminal */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
          {FINAL_STEPS.map((step) => (
            <StepButton
              key={step.key}
              step={step}
              count={counts.get(step.key)?.length ?? 0}
              isSelected={selected === step.key}
              color="#6B7280"
              onSelect={handleSelect}
            />
          ))}
          <div className="w-px bg-gray-200 mx-1 self-stretch" />
          {TERMINAL_STEPS.map((step) => (
            <StepButton
              key={step.key}
              step={step}
              count={counts.get(step.key)?.length ?? 0}
              isSelected={selected === step.key}
              color="#9CA3AF"
              muted
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      {/* Bill list for selected step */}
      {selected && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">
              {selectedStep?.label ?? selected}
              <span className="ml-2 text-gray-400 font-normal">{selectedBills.length} bill{selectedBills.length !== 1 ? "s" : ""}</span>
            </h2>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          </div>
          {selectedBills.length === 0 ? (
            <p className="text-sm text-gray-400">No bills at this stage.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedBills.map((bill) => <BillCard key={bill.id} bill={bill} />)}
            </div>
          )}
        </div>
      )}

      {/* Default: show all bills when nothing selected */}
      {!selected && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            All bills <span className="font-normal text-gray-400">— select a stage above to filter</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {bills.map((bill) => <BillCard key={bill.id} bill={bill} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline row ─────────────────────────────────────────────────────────────

function PipelineRow({
  label, color, steps, counts, selected, onSelect,
}: {
  label: string;
  color: string;
  steps: PipelineStep[];
  counts: Map<string, BillRow[]>;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px] font-bold uppercase tracking-wider w-12 shrink-0 text-right"
        style={{ color }}
      >
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((step, i) => (
          <div key={step.key} className="flex items-center gap-1">
            <StepButton
              step={step}
              count={counts.get(step.key)?.length ?? 0}
              isSelected={selected === step.key}
              color={color}
              onSelect={onSelect}
            />
            {i < steps.length - 1 && (
              <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 12 12">
                <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step button ─────────────────────────────────────────────────────────────

function StepButton({
  step, count, isSelected, color, muted = false, onSelect,
}: {
  step: PipelineStep;
  count: number;
  isSelected: boolean;
  color: string;
  muted?: boolean;
  onSelect: (key: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(step.key)}
      disabled={!hasBills(count)}
      title={step.label}
      className={`relative px-2.5 py-1.5 rounded-md text-xs font-medium transition-all border ${
        isSelected
          ? "text-white border-transparent shadow-sm"
          : hasBills(count)
          ? "bg-white border-gray-200 text-gray-700 hover:border-gray-400"
          : "bg-gray-50 border-gray-100 text-gray-300 cursor-default"
      } ${muted && !isSelected ? "opacity-60" : ""}`}
      style={isSelected ? { backgroundColor: color, borderColor: color } : undefined}
    >
      {step.shortLabel}
      {hasBills(count) && (
        <span
          className={`ml-1.5 text-[10px] font-bold ${isSelected ? "text-white opacity-80" : ""}`}
          style={!isSelected ? { color } : undefined}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function hasBills(count: number) { return count > 0; }

// ─── Bill card ────────────────────────────────────────────────────────────────

function BillCard({ bill }: { bill: BillRow }) {
  const sittingDay = bill.sitting_days;
  const dateForAgo = sittingDay?.sitting_date ?? bill.introduced_date;
  const ago = dateForAgo
    ? formatDistanceToNowStrict(parseISO(dateForAgo), { addSuffix: true })
    : null;
  const chamberLabel = bill.parliament_id === "fed_sen" ? "Senate" : "House";

  return (
    <Link
      href={`/bills/${bill.id}`}
      className="flex flex-col bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
    >
      <p className="text-sm font-medium text-gray-900 leading-snug">{bill.short_title}</p>
      {bill.ai_summary && (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-3 flex-1">
          {bill.ai_summary}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          {bill.members && (
            <>
              <span className="text-xs text-gray-400 truncate">{bill.members.name_display}</span>
              {bill.members.parties && <PartyBadge party={bill.members.parties} />}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            bill.parliament_id === "fed_sen" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
          }`}>
            {chamberLabel}
          </span>
          {ago && <span className="text-xs text-gray-400">{ago}</span>}
        </div>
      </div>
    </Link>
  );
}
