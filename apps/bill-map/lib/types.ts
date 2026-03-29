export type BillStage =
  | "introduction"
  | "first_reading"
  | "second_reading"
  | "third_reading"
  | "passed"
  | "defeated"
  | "lapsed";

export type House = "representatives" | "senate";

// APH Bills API
export interface APHBill {
  billId: string;
  title: string;
  shortTitle: string;
  introducedDate: string | null;
  houseIntroducedIn: "Representatives" | "Senate" | null;
  parliamentNumber: number | null;
  status: string | null;
  sponsor: string | null;
  portfolio: string | null;
  url: string | null;
}

// TVFY API
export interface TVFYDivisionSummary {
  id: number;
  name: string;
  date: string;
  number: number;
  house: House;
  outcome: string;
  aye_votes: number;
  no_votes: number;
}

export interface TVFYVote {
  vote: "aye" | "no";
  member: {
    id: number;
    first_name: string;
    last_name: string;
    electorate: string;
    party: string;
  };
}

export interface TVFYDivision extends TVFYDivisionSummary {
  votes: TVFYVote[];
}

export interface TVFYPolicyDivision {
  id: number;
  date: string;
  name: string;
  house: House;
  vote: "aye" | "no" | "aye3" | "no3" | "abstain";
}

export interface TVFYPolicy {
  id: number;
  name: string;
  description: string;
  divisions?: TVFYPolicyDivision[];
}

// Graph nodes
export interface BillNode {
  id: string;
  type: "bill";
  shortTitle: string;
  aphBillId: string | null;
  status: string | null;
  sponsor: string | null;
  portfolio: string | null;
  parliamentNumber: number | null;
  house: House | null;
  introducedDate: string | null;
  topicId: number | null;
  topicName: string | null;
  divisionIds: number[];
}

export interface DivisionNode {
  id: string;
  type: "division";
  tvfyId: number;
  name: string;
  date: string;
  house: House;
  outcome: string;
  ayeVotes: number;
  noVotes: number;
  topicId: number | null;
}

export type GraphNode = BillNode | DivisionNode;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "voted_on";
}

export interface TopicCluster {
  policyId: number;
  name: string;
  color: string;
  nodeIds: string[];
}

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}
