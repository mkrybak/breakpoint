import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ComponentKind, DesignGraph, EdgeBreaker } from "@/lib/core";
import { edgeSupportsResilience } from "@/lib/simulation";

export type ComponentNodeData = {
  kind: ComponentKind;
  label: string;
  config: Record<string, number | string | boolean>;
};

export type ComponentFlowNode = Node<ComponentNodeData, "component">;

export type FlowEdgeData = {
  kind: "sync" | "async";
  /** Split edges (lb source) only: 0–1 share; absent reads as 1. */
  trafficShare?: number;
  /** T-6.1, split edges only; absent === true (auto). */
  autoShare?: boolean;
  /** T-8.3, call edges (every non-lb source) only; absent reads as 1. */
  callsPerRequest?: number;
  /** T-8.5, sync call edges: ms the caller waits per attempt; absent = no timeout. */
  timeoutMs?: number;
  /** T-8.5, sync call edges: extra attempts after a failure; absent = 0. */
  retries?: number;
  /** T-8.6, sync edges: optional circuit breaker; absent = none. */
  breaker?: EdgeBreaker;
  /** Source node's kind — sourceKind lets FlowEdge pick split vs call without a store lookup. */
  sourceKind?: ComponentKind;
  /** T-12.3, derived in toFlow (never persisted): edgeSupportsResilience(edge, sourceKind). Absent reads false. */
  supportsResilience?: boolean;
};

export type ComponentFlowEdge = Edge<FlowEdgeData, "flow">;

/**
 * DOM-measured node sizes, keyed by node id. Ephemeral shell state — never part
 * of DesignGraph. React Flow keeps nodes at visibility:hidden unless the sizes
 * it reported via dimension changes are echoed back on the nodes prop.
 */
export type NodeMeasurements = Record<
  string,
  { width: number; height: number }
>;

export function toFlow(
  graph: DesignGraph,
  selectedNodeIds: string[],
  measured: NodeMeasurements = {},
  selectedEdgeIds: string[] = [],
): { nodes: ComponentFlowNode[]; edges: ComponentFlowEdge[] } {
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "component" as const,
      position: n.position,
      data: { kind: n.kind, label: n.label, config: n.config },
      selected: selectedNodeIds.includes(n.id),
      measured: measured[n.id],
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      type: "flow" as const,
      source: e.source,
      target: e.target,
      selected: selectedEdgeIds.includes(e.id),
      markerEnd: { type: MarkerType.ArrowClosed, color: "#525252" },
      data: {
        kind: e.kind,
        trafficShare: e.trafficShare,
        autoShare: e.autoShare,
        callsPerRequest: e.callsPerRequest,
        timeoutMs: e.timeoutMs,
        retries: e.retries,
        breaker: e.breaker,
        sourceKind: kindById.get(e.source),
        supportsResilience: edgeSupportsResilience(e, kindById.get(e.source)),
      },
    })),
  };
}

export function fromFlow(
  nodes: ComponentFlowNode[],
  edges: ComponentFlowEdge[],
  previousEntryNodeId: string,
): DesignGraph {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      label: n.data.label,
      position: { x: n.position.x, y: n.position.y },
      config: n.data.config,
    })),
    edges: edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.data?.kind ?? "sync",
        ...(e.data?.trafficShare !== undefined
          ? { trafficShare: e.data.trafficShare }
          : {}),
        ...(e.data?.autoShare !== undefined
          ? { autoShare: e.data.autoShare }
          : {}),
        ...(e.data?.callsPerRequest !== undefined
          ? { callsPerRequest: e.data.callsPerRequest }
          : {}),
        ...(e.data?.timeoutMs !== undefined
          ? { timeoutMs: e.data.timeoutMs }
          : {}),
        ...(e.data?.retries !== undefined ? { retries: e.data.retries } : {}),
        ...(e.data?.breaker !== undefined ? { breaker: e.data.breaker } : {}),
      })),
    entryNodeId: resolveEntryNodeId(nodes, previousEntryNodeId),
  };
}

/** Decision (02-data-model): keep previous if alive, else first client node, else "". */
function resolveEntryNodeId(
  nodes: ComponentFlowNode[],
  previous: string,
): string {
  if (nodes.some((n) => n.id === previous)) return previous;
  return nodes.find((n) => n.data.kind === "client")?.id ?? "";
}
