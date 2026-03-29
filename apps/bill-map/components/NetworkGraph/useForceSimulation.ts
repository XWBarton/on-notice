"use client";
import { useEffect, useRef, useState } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { GraphNode, GraphEdge } from "@/lib/types";

export type Positions = Map<string, { x: number; y: number }>;

interface SimNode extends SimulationNodeDatum {
  id: string;
  date: string | null;
}

const MIN_YEAR = 2006;

function targetY(date: string | null, height: number): number {
  if (!date) return height / 2;
  const year = new Date(date).getFullYear();
  const maxYear = new Date().getFullYear();
  const t = Math.max(0, Math.min(1, (year - MIN_YEAR) / Math.max(1, maxYear - MIN_YEAR)));
  // Recent bills float to the top (small y), older bills sink to the bottom (large y)
  return height * 0.9 - t * height * 0.8;
}

function nodeDate(node: GraphNode): string | null {
  if (node.type === "bill") return node.introducedDate;
  if (node.type === "division") return node.date;
  return null;
}

export function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): Positions {
  const [positions, setPositions] = useState<Positions>(new Map());
  const simRef = useRef<Simulation<SimNode, SimulationLinkDatum<SimNode>> | null>(null);
  const positionsRef = useRef<Positions>(new Map());

  useEffect(() => {
    positionsRef.current = positions;
  });

  useEffect(() => {
    if (nodes.length === 0 || width === 0 || height === 0) return;

    const prev = positionsRef.current;

    const simNodes: SimNode[] = nodes.map((n) => {
      const existing = prev.get(n.id);
      const date = nodeDate(n);
      return {
        id: n.id,
        date,
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 80,
        y: existing?.y ?? targetY(date, height) + (Math.random() - 0.5) * 60,
      };
    });

    const nodeIdSet = new Set(simNodes.map((n) => n.id));
    const simLinks = edges
      .filter((e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
      .map((e) => ({ source: e.source, target: e.target })) as SimulationLinkDatum<SimNode>[];

    simRef.current?.stop();

    const sim = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
          .id((d) => d.id)
          .distance(70)
          .strength(0.4),
      )
      .force("charge", forceManyBody().strength(-130))
      .force("x", forceX<SimNode>(width / 2).strength(0.04))
      .force("y", forceY<SimNode>((d) => targetY(d.date, height)).strength(0.25))
      .force("collide", forceCollide(30))
      .alphaDecay(0.025);

    const update = () => {
      setPositions(new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])));
    };

    sim.on("tick", update).on("end", () => {
      update();
      sim.stop();
    });

    simRef.current = sim;
    return () => { sim.stop(); };
    // Re-run only when the node/edge count changes, not on every position update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, width, height]);

  return positions;
}
