import type { Edge, Node } from "@xyflow/react";
import type { ComponentKind, DesignGraph } from "@/lib/core";

export type ComponentNodeData = {
  kind: ComponentKind;
  label: string;
  config: Record<string, number | string | boolean>;
  /** 0–1; placeholder until the sim engine streams real utilization (M2) */
  util: number;
};

export type ComponentFlowNode = Node<ComponentNodeData, "component">;

export type FlowEdgeData = { trafficShare: number; kind: "sync" | "async" };

export type ComponentFlowEdge = Edge<FlowEdgeData>;

export function toFlow(
  graph: DesignGraph,
  selectedNodeIds: string[],
): { nodes: ComponentFlowNode[]; edges: ComponentFlowEdge[] } {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: "component" as const,
      position: n.position,
      data: { kind: n.kind, label: n.label, config: n.config, util: 0 },
      selected: selectedNodeIds.includes(n.id),
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      data: { trafficShare: e.trafficShare, kind: e.kind },
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
        trafficShare: e.data?.trafficShare ?? 1,
        kind: e.data?.kind ?? "sync",
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
