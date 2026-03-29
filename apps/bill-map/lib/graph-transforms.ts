// Transforms raw API data into graph nodes, edges, and topic clusters.

import type {
  APHBill,
  TVFYDivision,
  TVFYPolicy,
  BillNode,
  DivisionNode,
  GraphNode,
  GraphEdge,
  TopicCluster,
} from "./types";

// Colour palette for topic clusters — cycles if more policies than colours
const TOPIC_COLORS = [
  "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6",
  "#F79646", "#2C4770", "#7F0000", "#4C6E00", "#004C66",
  "#6B3F7C", "#8B4513", "#1E6B4C", "#7B6000", "#004D40",
  "#1A5276", "#922B21", "#1E8449", "#7D3C98", "#0E6655",
];

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract a bill title from a TVFY division name.
// Division names often look like "Infrastructure Levy Bill 2024 — Second Reading"
function billTitleFromDivision(divisionName: string): string {
  return divisionName
    .replace(/\s*[—–-]\s*(first|second|third)\s+reading.*/i, "")
    .replace(/\s*[—–-]\s*introduction.*/i, "")
    .replace(/\s*[—–-]\s*(consideration|passage|resumption|motion|concurrence).*/i, "")
    .trim();
}

function looksLikeBill(name: string): boolean {
  const upper = name.toUpperCase();
  return upper.includes("BILL") || upper.includes("ACT") || upper.includes("READING");
}

// Map normalised bill title → policy id using policy division lookups
function buildTitlePolicyMap(
  policies: TVFYPolicy[],
  divisionById: Map<number, TVFYDivision>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const policy of policies) {
    if (!policy.divisions) continue;
    for (const pd of policy.divisions) {
      const div = divisionById.get(pd.id);
      if (!div) continue;
      const title = billTitleFromDivision(div.name);
      if (title) map.set(normTitle(title), policy.id);
    }
  }
  return map;
}

export function buildGraph(
  aphBills: APHBill[],
  divisions: TVFYDivision[],
  policies: TVFYPolicy[],
): { nodes: GraphNode[]; edges: GraphEdge[]; topics: TopicCluster[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const policyById = new Map(policies.map((p, i) => [p.id, { ...p, color: TOPIC_COLORS[i % TOPIC_COLORS.length] }]));
  const divisionById = new Map(divisions.map((d) => [d.id, d]));
  const titlePolicyMap = buildTitlePolicyMap(policies, divisionById);

  // --- Bill nodes from APH ---
  const billByNormTitle = new Map<string, BillNode>();

  for (const bill of aphBills) {
    const nt = normTitle(bill.shortTitle);
    const topicId = titlePolicyMap.get(nt) ?? null;
    const node: BillNode = {
      id: `bill::${bill.billId}`,
      type: "bill",
      shortTitle: bill.shortTitle,
      aphBillId: bill.billId,
      status: bill.status,
      sponsor: bill.sponsor,
      portfolio: bill.portfolio,
      parliamentNumber: bill.parliamentNumber,
      house:
        bill.houseIntroducedIn === "Representatives"
          ? "representatives"
          : bill.houseIntroducedIn === "Senate"
            ? "senate"
            : null,
      introducedDate: bill.introducedDate,
      topicId,
      topicName: topicId != null ? (policyById.get(topicId)?.name ?? null) : null,
      divisionIds: [],
    };
    nodes.push(node);
    billByNormTitle.set(nt, node);
  }

  // --- Division nodes + infer bill nodes from division names ---
  for (const div of divisions) {
    if (!looksLikeBill(div.name)) continue;

    const topicId = (() => {
      for (const policy of policies) {
        if (policy.divisions?.some((pd) => pd.id === div.id)) return policy.id;
      }
      return null;
    })();

    const divNode: DivisionNode = {
      id: `division::${div.id}`,
      type: "division",
      tvfyId: div.id,
      name: div.name ?? "",
      date: div.date,
      house: div.house,
      outcome: div.outcome ?? "",
      ayeVotes: div.aye_votes ?? 0,
      noVotes: div.no_votes ?? 0,
      topicId,
    };
    nodes.push(divNode);

    // Link division to bill node (find or create)
    const billTitle = billTitleFromDivision(div.name);
    if (billTitle) {
      const nt = normTitle(billTitle);
      let billNode = billByNormTitle.get(nt);

      if (!billNode) {
        // Infer a bill node from the division name — no APH match
        const nodeId = `bill::inferred::${nt.replace(/\s+/g, "-").slice(0, 80)}`;
        billNode = {
          id: nodeId,
          type: "bill",
          shortTitle: billTitle,
          aphBillId: null,
          status: null,
          sponsor: null,
          portfolio: null,
          parliamentNumber: null,
          house: div.house,
          introducedDate: div.date,
          topicId,
          topicName: topicId != null ? (policyById.get(topicId)?.name ?? null) : null,
          divisionIds: [],
        };
        nodes.push(billNode);
        billByNormTitle.set(nt, billNode);
      }

      billNode.divisionIds.push(div.id);

      edges.push({
        id: `edge::${billNode.id}::${divNode.id}`,
        source: billNode.id,
        target: divNode.id,
        type: "voted_on",
      });
    }
  }

  // --- Topic clusters ---
  const topicNodeIds = new Map<number, Set<string>>();
  for (const node of nodes) {
    if (node.topicId != null) {
      if (!topicNodeIds.has(node.topicId)) topicNodeIds.set(node.topicId, new Set());
      topicNodeIds.get(node.topicId)!.add(node.id);
    }
  }

  const topics: TopicCluster[] = [];
  for (const [policyId, nodeIdSet] of topicNodeIds) {
    const policy = policyById.get(policyId);
    if (!policy) continue;
    topics.push({
      policyId,
      name: policy.name,
      color: policy.color,
      nodeIds: [...nodeIdSet],
    });
  }

  return { nodes, edges, topics };
}
