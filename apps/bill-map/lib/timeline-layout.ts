// Converts the flat node/edge graph into positioned swimlane tracks for the timeline renderer.

import type { GraphNode, GraphEdge, TopicCluster, BillNode, DivisionNode, Lens } from "./types";

export const RIGHT_PAD = 20;
export const PILL_H = 18;
export const PILL_GAP = 5;
export const LANE_PAD = 12;

export interface Swimlane {
  id: string;
  label: string;
  color: string | null;
  y: number;       // content-space top
  height: number;  // content-space height
}

export interface DivisionMarker {
  division: DivisionNode;
  x: number;      // content-space (0..drawW)
  passed: boolean;
}

export interface BillTrack {
  bill: BillNode;
  x1: number;     // content-space pill start
  x2: number;     // content-space pill end
  y: number;      // content-space pill centre
  color: string;
  divisionMarkers: DivisionMarker[];
}

function divisionPassed(div: DivisionNode): boolean {
  const o = (div.outcome ?? "").toLowerCase();
  if (o.includes("passed") || o === "aye" || o.includes("agreed")) return true;
  if (o.includes("negatived") || o === "no" || o.includes("defeated")) return false;
  return (div.ayeVotes ?? 0) >= (div.noVotes ?? 0);
}

function laneKey(bill: BillNode, lens: Lens): string {
  switch (lens) {
    case "topic":     return bill.topicId != null ? `topic::${bill.topicId}` : "__none__";
    case "portfolio": return bill.portfolio ?? "__none__";
    case "house":     return bill.house ?? "__none__";
    case "status": {
      const s = (bill.status ?? "").toLowerCase();
      if (s.includes("royal assent") || s.includes("act now")) return "passed";
      if (s.includes("passed"))    return "passed";
      if (s.includes("defeated") || s.includes("negatived")) return "defeated";
      if (s.includes("lapsed"))    return "lapsed";
      if (s.includes("withdrawn")) return "withdrawn";
      return "pending";
    }
  }
}

function laneLabel(key: string, bill: BillNode, lens: Lens, topics: TopicCluster[]): string {
  if (key === "__none__") return { topic: "Uncategorised", portfolio: "No portfolio", house: "Unknown house", status: "Unknown" }[lens] ?? "Unknown";
  switch (lens) {
    case "topic": {
      const id = parseInt(key.replace("topic::", ""));
      return topics.find(t => t.policyId === id)?.name ?? "Uncategorised";
    }
    case "portfolio": return bill.portfolio ?? key;
    case "house": return bill.house === "representatives" ? "House of Representatives" : "Senate";
    case "status": {
      const map: Record<string, string> = {
        passed: "Passed / Royal Assent", defeated: "Defeated",
        lapsed: "Lapsed", withdrawn: "Withdrawn", pending: "Before Parliament",
      };
      return map[key] ?? key;
    }
  }
}

function laneColor(key: string, bill: BillNode, lens: Lens, topics: TopicCluster[]): string | null {
  if (lens === "topic" && bill.topicId != null)
    return topics.find(t => t.policyId === bill.topicId)?.color ?? null;
  if (lens === "status") {
    const map: Record<string, string> = {
      passed: "#16a34a", defeated: "#dc2626",
      lapsed: "#9ca3af", withdrawn: "#f59e0b", pending: "#3b82f6",
    };
    return map[key] ?? null;
  }
  return null;
}

const STATUS_ORDER = ["passed", "pending", "defeated", "lapsed", "withdrawn", "__none__"];

export function buildTimelineLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  topics: TopicCluster[],
  lens: Lens,
  /** Width of the content area (SVG width minus the label column) */
  drawW: number,
  timeStart: Date,
  timeEnd: Date,
): { swimlanes: Swimlane[]; tracks: BillTrack[]; totalHeight: number } {
  const bills = nodes.filter((n): n is BillNode => n.type === "bill" && n.introducedDate != null);
  const divById = new Map<string, DivisionNode>();
  for (const n of nodes) if (n.type === "division") divById.set(n.id, n as DivisionNode);

  const billDivs = new Map<string, DivisionNode[]>();
  for (const e of edges) {
    const div = divById.get(e.target);
    if (!div) continue;
    if (!billDivs.has(e.source)) billDivs.set(e.source, []);
    billDivs.get(e.source)!.push(div);
  }

  const span = timeEnd.getTime() - timeStart.getTime();
  const tX = (d: string | null): number => {
    if (!d) return 0;
    return Math.max(0, Math.min(drawW, ((new Date(d).getTime() - timeStart.getTime()) / span) * drawW));
  };

  // Group into lanes
  type Lane = { key: string; label: string; color: string | null; bills: BillNode[] };
  const lanes = new Map<string, Lane>();
  for (const bill of bills) {
    const key = laneKey(bill, lens);
    if (!lanes.has(key))
      lanes.set(key, { key, label: laneLabel(key, bill, lens, topics), color: laneColor(key, bill, lens, topics), bills: [] });
    lanes.get(key)!.bills.push(bill);
  }

  const sorted = [...lanes.values()].sort((a, b) => {
    if (a.key === "__none__") return 1;
    if (b.key === "__none__") return -1;
    if (lens === "status") {
      return STATUS_ORDER.indexOf(a.key) - STATUS_ORDER.indexOf(b.key);
    }
    return a.label.localeCompare(b.label);
  });

  const swimlanes: Swimlane[] = [];
  const tracks: BillTrack[] = [];
  let yOffset = 0;

  for (const lane of sorted) {
    lane.bills.sort((a, b) => (a.introducedDate ?? "").localeCompare(b.introducedDate ?? ""));

    const laneTop = yOffset;

    lane.bills.forEach((bill, i) => {
      const divs = billDivs.get(bill.id) ?? [];
      const x1 = tX(bill.introducedDate);
      const lastDate = divs.length > 0
        ? divs.reduce((m, d) => d.date > m ? d.date : m, divs[0].date)
        : null;
      const x2 = Math.max(lastDate ? tX(lastDate) : x1, x1 + 36);

      const trackY = laneTop + LANE_PAD + i * (PILL_H + PILL_GAP) + PILL_H / 2;

      const color = lane.color ?? "#6b7280";

      tracks.push({
        bill, x1, x2,
        y: trackY,
        color,
        divisionMarkers: divs.map(div => ({
          division: div,
          x: tX(div.date),
          passed: divisionPassed(div),
        })),
      });
    });

    const laneH = LANE_PAD * 2 + lane.bills.length * (PILL_H + PILL_GAP);
    swimlanes.push({ id: lane.key, label: lane.label, color: lane.color, y: laneTop, height: laneH });
    yOffset += laneH;
  }

  return { swimlanes, tracks, totalHeight: yOffset };
}
