"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { useForceSimulation } from "./useForceSimulation";
import type { GraphNode, GraphEdge, TopicCluster } from "@/lib/types";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  topics: TopicCluster[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function nodeLabel(node: GraphNode): string {
  return node.type === "bill" ? node.shortTitle : node.name;
}

function divisionPassed(node: GraphNode & { type: "division" }): boolean {
  const outcome = (node.outcome ?? "").toLowerCase();
  if (outcome.includes("passed") || outcome === "aye" || outcome.includes("agreed")) return true;
  if (outcome.includes("negatived") || outcome === "no" || outcome.includes("defeated")) return false;
  // Fall back to vote counts
  return node.ayeVotes > node.noVotes;
}

function nodeColor(node: GraphNode, topics: TopicCluster[]): string {
  if (node.topicId != null) {
    const topic = topics.find((t) => t.policyId === node.topicId);
    if (topic) return topic.color;
  }
  if (node.type === "division") {
    return divisionPassed(node) ? "#16a34a" : "#dc2626";
  }
  return "#6b7280";
}

export default function NetworkGraph({ nodes, edges, topics, selectedNodeId, onSelectNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const positions = useForceSimulation(nodes, edges, dimensions.width, dimensions.height);

  // Pan / zoom
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    setTransform((t) => {
      const newK = Math.max(0.25, Math.min(5, t.k * factor));
      return {
        k: newK,
        x: cursorX - (cursorX - t.x) * (newK / t.k),
        y: cursorY - (cursorY - t.y) * (newK / t.k),
      };
    });
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if ((e.target as SVGElement).closest("[data-node]")) return;
      drag.current = { sx: e.clientX, sy: e.clientY, tx: transform.x, ty: transform.y };
    },
    [transform],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    setTransform((t) => ({
      ...t,
      x: drag.current!.tx + e.clientX - drag.current!.sx,
      y: drag.current!.ty + e.clientY - drag.current!.sy,
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    drag.current = null;
  }, []);

  const BILL_R = 16;
  const DIV_HALF = 9;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden select-none">
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onClick={(e) => {
          if ((e.target as SVGElement).closest("[data-node]")) return;
          onSelectNode(null);
        }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Topic cluster backgrounds */}
          {topics.map((topic) => {
            const pts = topic.nodeIds
              .map((id) => positions.get(id))
              .filter((p): p is { x: number; y: number } => p != null);
            if (pts.length < 2) return null;
            const xs = pts.map((p) => p.x);
            const ys = pts.map((p) => p.y);
            return (
              <rect
                key={topic.policyId}
                x={Math.min(...xs) - 44}
                y={Math.min(...ys) - 44}
                width={Math.max(...xs) - Math.min(...xs) + 88}
                height={Math.max(...ys) - Math.min(...ys) + 88}
                rx={20}
                fill={topic.color}
                fillOpacity={0.07}
                stroke={topic.color}
                strokeOpacity={0.2}
                strokeWidth={1}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* Edges */}
          {edges.map((edge) => {
            const s = positions.get(edge.source);
            const t = positions.get(edge.target);
            if (!s || !t) return null;
            return (
              <line
                key={edge.id}
                x1={s.x} y1={s.y}
                x2={t.x} y2={t.y}
                stroke="#d1d5db"
                strokeWidth={1}
                strokeOpacity={0.7}
                style={{ pointerEvents: "none" }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const selected = selectedNodeId === node.id;
            const color = nodeColor(node, topics);
            const label = nodeLabel(node);
            const shortLabel = label.length > 28 ? label.slice(0, 25) + "…" : label;

            if (node.type === "division") {
              return (
                <g
                  key={node.id}
                  data-node="true"
                  transform={`translate(${pos.x},${pos.y})`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => { e.stopPropagation(); onSelectNode(selected ? null : node.id); }}
                >
                  <rect
                    x={-DIV_HALF} y={-DIV_HALF}
                    width={DIV_HALF * 2} height={DIV_HALF * 2}
                    rx={2}
                    fill={color}
                    fillOpacity={0.88}
                    stroke={selected ? "#111827" : "white"}
                    strokeWidth={selected ? 2 : 1}
                  />
                  {selected && (
                    <text
                      y={DIV_HALF + 14}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#374151"
                      style={{ pointerEvents: "none" }}
                    >
                      {shortLabel}
                    </text>
                  )}
                </g>
              );
            }

            // Bill node
            return (
              <g
                key={node.id}
                data-node="true"
                transform={`translate(${pos.x},${pos.y})`}
                style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); onSelectNode(selected ? null : node.id); }}
              >
                <circle
                  r={BILL_R}
                  fill={color}
                  fillOpacity={0.15}
                  stroke={selected ? "#111827" : color}
                  strokeWidth={selected ? 2.5 : 1.5}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fontWeight="600"
                  fill={color}
                  style={{ pointerEvents: "none" }}
                >
                  {node.divisionIds?.length ?? 0}
                </text>
                <text
                  y={BILL_R + 11}
                  textAnchor="middle"
                  fontSize={9}
                  fill={selected ? "#111827" : "#374151"}
                  fontWeight={selected ? "600" : "400"}
                  style={{ pointerEvents: "none" }}
                >
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          className="w-8 h-8 bg-white border border-gray-300 rounded text-gray-600 text-lg leading-none hover:bg-gray-50 shadow-sm"
          onClick={() => setTransform((t) => ({ ...t, k: Math.min(5, t.k * 1.3) }))}
        >+</button>
        <button
          className="w-8 h-8 bg-white border border-gray-300 rounded text-gray-600 text-lg leading-none hover:bg-gray-50 shadow-sm"
          onClick={() => setTransform((t) => ({ ...t, k: Math.max(0.25, t.k / 1.3) }))}
        >−</button>
        <button
          className="w-8 h-8 bg-white border border-gray-300 rounded text-gray-500 text-xs leading-none hover:bg-gray-50 shadow-sm"
          onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
          title="Reset view"
        >⌂</button>
      </div>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          Loading…
        </div>
      )}
    </div>
  );
}
