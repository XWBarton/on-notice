"use client";
import { useEffect, useCallback, useState } from "react";
import TimelineGraph from "./TimelineGraph/TimelineGraph";
import BillDetailPanel from "./BillDetailPanel";
import TimeSlider from "./TimeSlider";
import LensSelector from "./LensSelector";
import { useGraphStore } from "./NetworkGraph/useGraphStore";
import { buildGraph } from "@/lib/graph-transforms";
import type { TVFYPolicy, APHBill, TVFYDivision, DateRange, Lens } from "@/lib/types";

interface Props {
  initialPolicies: TVFYPolicy[];
  focus?: string | null;
}

const CURRENT_YEAR = new Date().getFullYear();

function toDateStr(year: number, month = 1, day = 1): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BillMap({ initialPolicies, focus }: Props) {
  const { state, mergeGraph, setLoadingRange, clearLoadingRange, selectNode, isRangeAlreadyLoaded } = useGraphStore();

  const [fromYear, setFromYear] = useState(CURRENT_YEAR);
  const [lens, setLens] = useState<Lens>("topic");

  const loadRange = useCallback(
    async (start: string, end: string) => {
      const range: DateRange = { start, end };
      if (isRangeAlreadyLoaded(range)) return;
      setLoadingRange(range);
      try {
        const [repDivs, senDivs, bills] = await Promise.all([
          fetch(`/api/divisions?start=${start}&end=${end}&house=representatives`).then(r => r.json()).catch(() => []) as Promise<TVFYDivision[]>,
          fetch(`/api/divisions?start=${start}&end=${end}&house=senate`).then(r => r.json()).catch(() => []) as Promise<TVFYDivision[]>,
          fetch(`/api/bills`).then(r => r.json()).catch(() => []) as Promise<APHBill[]>,
        ]);
        const allDivisions = [
          ...(Array.isArray(repDivs) ? repDivs : []),
          ...(Array.isArray(senDivs) ? senDivs : []),
        ];
        const { nodes, edges, topics } = buildGraph(Array.isArray(bills) ? bills : [], allDivisions, initialPolicies);
        mergeGraph(nodes, edges, topics, range);
      } catch (err) {
        console.error("Failed to load graph data:", err);
        clearLoadingRange(range);
      }
    },
    [initialPolicies, isRangeAlreadyLoaded, setLoadingRange, clearLoadingRange, mergeGraph],
  );

  useEffect(() => { loadRange(toDateStr(CURRENT_YEAR), todayStr()); }, [loadRange]);

  useEffect(() => {
    if (!focus) return;
    const match = [...state.nodes.values()].find(
      n => n.type === "bill" && (n.aphBillId === focus || n.shortTitle.toLowerCase() === focus.toLowerCase()),
    );
    if (match) selectNode(match.id);
  }, [focus, state.nodes, selectNode]);

  const handleTimeChange = useCallback(
    (year: number) => {
      setFromYear(year);
      loadRange(toDateStr(year), todayStr());
    },
    [loadRange],
  );

  const nodesArray = [...state.nodes.values()];
  const billCount = nodesArray.filter(n => n.type === "bill").length;
  const divisionCount = nodesArray.filter(n => n.type === "division").length;
  const isLoading = state.loadingRanges.length > 0;
  const selectedNode = state.selectedNodeId ? (state.nodes.get(state.selectedNodeId) ?? null) : null;

  const timeStart = new Date(fromYear, 0, 1);
  const timeEnd = new Date();

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-900 leading-tight">Bill Map</h1>
            <p className="text-xs text-gray-400 tabular-nums">
              {billCount} bills · {divisionCount} divisions
              {isLoading && <span className="ml-1 animate-pulse">· loading…</span>}
            </p>
          </div>
          <LensSelector value={lens} onChange={setLens} />
        </div>
        <a href="https://on-notice.xyz" className="text-xs text-gray-400 hover:text-gray-600">← on-notice</a>
      </header>

      {/* Timeline */}
      <div className="flex-1 relative overflow-hidden">
        <TimelineGraph
          nodes={nodesArray}
          edges={state.edges}
          topics={state.topics}
          lens={lens}
          timeStart={timeStart}
          timeEnd={timeEnd}
          selectedNodeId={state.selectedNodeId}
          onSelectNode={selectNode}
        />
        <BillDetailPanel node={selectedNode} onClose={() => selectNode(null)} />
      </div>

      {/* Time scrubber */}
      <TimeSlider
        value={fromYear}
        min={2006}
        max={CURRENT_YEAR}
        onChange={handleTimeChange}
        isLoading={isLoading}
      />
    </div>
  );
}
