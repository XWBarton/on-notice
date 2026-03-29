"use client";
import { useReducer, useCallback } from "react";
import type { GraphNode, GraphEdge, TVFYPolicy, TopicCluster, DateRange } from "@/lib/types";

export interface GraphState {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  policies: TVFYPolicy[];
  topics: TopicCluster[];
  loadedRanges: DateRange[];
  loadingRanges: DateRange[];
  selectedNodeId: string | null;
}

type Action =
  | { type: "MERGE"; nodes: GraphNode[]; edges: GraphEdge[]; topics: TopicCluster[]; range: DateRange }
  | { type: "SET_POLICIES"; policies: TVFYPolicy[] }
  | { type: "SET_LOADING"; range: DateRange }
  | { type: "CLEAR_LOADING"; range: DateRange }
  | { type: "SELECT"; id: string | null };

const initial: GraphState = {
  nodes: new Map(),
  edges: [],
  policies: [],
  topics: [],
  loadedRanges: [],
  loadingRanges: [],
  selectedNodeId: null,
};

function rangeKey(r: DateRange) {
  return `${r.start}::${r.end}`;
}

function reducer(state: GraphState, action: Action): GraphState {
  switch (action.type) {
    case "MERGE": {
      const nodes = new Map(state.nodes);
      for (const n of action.nodes) nodes.set(n.id, n);

      const existingEdgeIds = new Set(state.edges.map((e) => e.id));
      const newEdges = action.edges.filter((e) => !existingEdgeIds.has(e.id));

      const topicMap = new Map(state.topics.map((t) => [t.policyId, t]));
      for (const topic of action.topics) {
        const existing = topicMap.get(topic.policyId);
        if (existing) {
          const combined = new Set([...existing.nodeIds, ...topic.nodeIds]);
          topicMap.set(topic.policyId, { ...topic, nodeIds: [...combined] });
        } else {
          topicMap.set(topic.policyId, topic);
        }
      }

      return {
        ...state,
        nodes,
        edges: [...state.edges, ...newEdges],
        topics: [...topicMap.values()],
        loadedRanges: [...state.loadedRanges, action.range],
        loadingRanges: state.loadingRanges.filter((r) => rangeKey(r) !== rangeKey(action.range)),
      };
    }
    case "SET_POLICIES":
      return { ...state, policies: action.policies };
    case "SET_LOADING":
      return { ...state, loadingRanges: [...state.loadingRanges, action.range] };
    case "CLEAR_LOADING":
      return {
        ...state,
        loadingRanges: state.loadingRanges.filter((r) => rangeKey(r) !== rangeKey(action.range)),
      };
    case "SELECT":
      return { ...state, selectedNodeId: action.id };
    default:
      return state;
  }
}

function isRangeLoaded(loaded: DateRange[], range: DateRange): boolean {
  return loaded.some((r) => r.start <= range.start && r.end >= range.end);
}

export function useGraphStore() {
  const [state, dispatch] = useReducer(reducer, initial);

  const mergeGraph = useCallback(
    (nodes: GraphNode[], edges: GraphEdge[], topics: TopicCluster[], range: DateRange) => {
      dispatch({ type: "MERGE", nodes, edges, topics, range });
    },
    [],
  );

  const setPolicies = useCallback((policies: TVFYPolicy[]) => {
    dispatch({ type: "SET_POLICIES", policies });
  }, []);

  const setLoadingRange = useCallback((range: DateRange) => {
    dispatch({ type: "SET_LOADING", range });
  }, []);

  const clearLoadingRange = useCallback((range: DateRange) => {
    dispatch({ type: "CLEAR_LOADING", range });
  }, []);

  const selectNode = useCallback((id: string | null) => {
    dispatch({ type: "SELECT", id });
  }, []);

  const isRangeAlreadyLoaded = useCallback(
    (range: DateRange) => isRangeLoaded(state.loadedRanges, range),
    [state.loadedRanges],
  );

  return {
    state,
    mergeGraph,
    setPolicies,
    setLoadingRange,
    clearLoadingRange,
    selectNode,
    isRangeAlreadyLoaded,
  };
}
