"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { GraphNode, GraphEdge, TopicCluster, Lens } from "@/lib/types";
import { buildTimelineLayout, PILL_H } from "@/lib/timeline-layout";

const LEFT_MARGIN = 168; // label column width
const RIGHT_PAD = 20;
const YEAR_H = 28;       // fixed year-axis height

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topics: TopicCluster[];
  lens: Lens;
  timeStart: Date;
  timeEnd: Date;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export default function TimelineGraph({
  nodes, edges, topics, lens, timeStart, timeEnd, selectedNodeId, onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 1200, h: 800 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setDim({ w: e.contentRect.width, h: e.contentRect.height }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const drawW = dim.w - LEFT_MARGIN - RIGHT_PAD;
  const span = timeEnd.getTime() - timeStart.getTime();

  const { swimlanes, tracks, totalHeight } = useMemo(
    () => buildTimelineLayout(nodes, edges, topics, lens, drawW, timeStart, timeEnd),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length, edges.length, topics.length, lens, drawW, timeStart.getTime(), timeEnd.getTime()],
  );

  // Pan / zoom
  const [tr, setTr] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setTr(t => {
      const newK = Math.max(0.25, Math.min(12, t.k * factor));
      return { k: newK, x: cx - (cx - t.x) * (newK / t.k), y: cy - (cy - t.y) * (newK / t.k) };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest("[data-node]")) return;
    drag.current = { sx: e.clientX, sy: e.clientY, tx: tr.x, ty: tr.y };
  }, [tr]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    setTr(t => ({ ...t, x: drag.current!.tx + e.clientX - drag.current!.sx, y: drag.current!.ty + e.clientY - drag.current!.sy }));
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  // Year tick marks (in drawW space, 0..drawW)
  const yearTicks = useMemo(() => {
    const ticks = [];
    for (let y = timeStart.getFullYear(); y <= timeEnd.getFullYear() + 1; y++) {
      const t = new Date(y, 0, 1).getTime();
      const offset = ((t - timeStart.getTime()) / span) * drawW;
      if (offset >= -drawW && offset <= drawW * 2) ticks.push({ year: y, offset });
    }
    return ticks;
  }, [timeStart, timeEnd, drawW, span]);

  // Sticky lane labels: compute visible center in screen space
  const stickyLabels = useMemo(() => {
    const contentH = dim.h - YEAR_H;
    return swimlanes.map(lane => {
      // visible portion of lane in content-space
      const visTop = Math.max(lane.y, -tr.y / tr.k);
      const visBot = Math.min(lane.y + lane.height, (contentH - tr.y) / tr.k);
      if (visTop >= visBot) return null;
      const yScreen = (visTop + visBot) / 2 * tr.k + tr.y + YEAR_H;
      return { lane, yScreen };
    }).filter(Boolean) as { lane: typeof swimlanes[0]; yScreen: number }[];
  }, [swimlanes, tr, dim.h]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none bg-white">
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={e => {
          if ((e.target as SVGElement).closest("[data-node]")) return;
          onSelectNode(null);
        }}
      >
        {/* ── Scrollable content ─────────────────────────── */}
        <g transform={`translate(${tr.x}, ${tr.y + YEAR_H}) scale(${tr.k})`}>
          {/* Swimlane alternating backgrounds */}
          {swimlanes.map((lane, i) => (
            <rect
              key={lane.id}
              x={0} y={lane.y}
              width={LEFT_MARGIN + drawW}
              height={lane.height}
              fill={i % 2 === 0 ? "#f9fafb" : "#ffffff"}
            />
          ))}

          {/* Swimlane borders */}
          {swimlanes.map(lane => (
            <line
              key={lane.id + "-border"}
              x1={0} y1={lane.y + lane.height}
              x2={LEFT_MARGIN + drawW} y2={lane.y + lane.height}
              stroke="#e5e7eb" strokeWidth={0.5}
            />
          ))}

          {/* Year grid lines */}
          {yearTicks.map(({ year, offset }) => (
            <line
              key={year}
              x1={LEFT_MARGIN + offset} y1={0}
              x2={LEFT_MARGIN + offset} y2={totalHeight}
              stroke="#f3f4f6" strokeWidth={1}
            />
          ))}

          {/* Bill tracks */}
          {tracks.map(track => {
            const selected = selectedNodeId === track.bill.id;
            const x1 = LEFT_MARGIN + track.x1;
            const x2 = LEFT_MARGIN + track.x2;
            const pw = Math.max(x2 - x1, 4);
            const py = track.y - PILL_H / 2;

            return (
              <g
                key={track.bill.id}
                data-node="true"
                onClick={e => { e.stopPropagation(); onSelectNode(selected ? null : track.bill.id); }}
                style={{ cursor: "pointer" }}
              >
                {/* Pill body */}
                <rect
                  x={x1} y={py}
                  width={pw} height={PILL_H}
                  rx={PILL_H / 2}
                  fill={track.color}
                  fillOpacity={selected ? 0.35 : 0.15}
                  stroke={track.color}
                  strokeWidth={selected ? 1.5 : 0.8}
                />
                {/* Bill label (only if pill wide enough) */}
                {pw > 50 && (
                  <text
                    x={x1 + 9} y={track.y}
                    dominantBaseline="middle"
                    fontSize={9}
                    fill={selected ? "#111827" : "#374151"}
                    fontWeight={selected ? "600" : "400"}
                    style={{ pointerEvents: "none" }}
                  >
                    {track.bill.shortTitle.length > 46
                      ? track.bill.shortTitle.slice(0, 43) + "…"
                      : track.bill.shortTitle}
                  </text>
                )}
                {/* Division outcome markers */}
                {track.divisionMarkers.map((dm, i) => (
                  <circle
                    key={i}
                    cx={LEFT_MARGIN + dm.x} cy={track.y}
                    r={3.5}
                    fill={dm.passed ? "#16a34a" : "#dc2626"}
                    stroke="white" strokeWidth={0.8}
                    style={{ pointerEvents: "none" }}
                  />
                ))}
              </g>
            );
          })}
        </g>

        {/* ── Fixed year axis (not scrolled) ─────────────── */}
        <rect x={0} y={0} width={dim.w} height={YEAR_H} fill="white" />
        <line x1={0} y1={YEAR_H} x2={dim.w} y2={YEAR_H} stroke="#e5e7eb" strokeWidth={1} />
        {yearTicks.map(({ year, offset }) => {
          const xScreen = (LEFT_MARGIN + offset) * tr.k + tr.x;
          if (xScreen < LEFT_MARGIN - 4 || xScreen > dim.w + 40) return null;
          return (
            <g key={year} transform={`translate(${xScreen}, 0)`}>
              <line x1={0} y1={YEAR_H - 5} x2={0} y2={YEAR_H} stroke="#d1d5db" strokeWidth={1} />
              <text x={3} y={YEAR_H - 8} fontSize={10} fill="#6b7280">{year}</text>
            </g>
          );
        })}

        {/* ── Sticky lane labels ─────────────────────────── */}
        {stickyLabels.map(({ lane, yScreen }) => (
          <g key={lane.id + "-label"}>
            <rect x={0} y={yScreen - 11} width={LEFT_MARGIN - 2} height={22} fill="rgba(255,255,255,0.92)" />
            {lane.color && (
              <rect x={8} y={yScreen - 5} width={8} height={10} rx={2} fill={lane.color} fillOpacity={0.75} />
            )}
            <text
              x={lane.color ? 22 : 8}
              y={yScreen}
              dominantBaseline="middle"
              fontSize={11}
              fontWeight="500"
              fill={lane.color ?? "#374151"}
            >
              {lane.label.length > 20 ? lane.label.slice(0, 18) + "…" : lane.label}
            </text>
          </g>
        ))}

        {/* ── Divider between label col and content ──────── */}
        <line
          x1={LEFT_MARGIN * tr.k + tr.x}
          y1={YEAR_H}
          x2={LEFT_MARGIN * tr.k + tr.x}
          y2={dim.h}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        {[
          { label: "+", fn: (t: typeof tr) => ({ ...t, k: Math.min(12, t.k * 1.3) }) },
          { label: "−", fn: (t: typeof tr) => ({ ...t, k: Math.max(0.25, t.k / 1.3) }) },
          { label: "⌂", fn: () => ({ x: 0, y: 0, k: 1 }) },
        ].map(({ label, fn }) => (
          <button
            key={label}
            className="w-8 h-8 bg-white border border-gray-300 rounded text-gray-600 text-sm leading-none hover:bg-gray-50 shadow-sm"
            onClick={() => setTr(fn)}
          >{label}</button>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          Loading…
        </div>
      )}
    </div>
  );
}
