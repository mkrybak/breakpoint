import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import type { ComponentKind, DesignEdge, DesignGraph } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  fromFlow,
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
  type NodeMeasurements,
} from "./flow-adapter";

interface DesignStore {
  graph: DesignGraph;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  /** DOM sizes reported by React Flow — must be echoed back or nodes stay hidden. */
  measured: NodeMeasurements;
  onNodesChange: (changes: NodeChange<ComponentFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ComponentFlowEdge>[]) => void;
  /** Creates a sync edge with full traffic share; duplicate source→target is a no-op. */
  onConnect: (connection: Connection) => void;
  /** Creates a node with registry defaults; returns its id. Used by the palette (T-1.3). */
  addNode: (kind: ComponentKind, position: { x: number; y: number }) => string;
  /** Edge inspector (T-1.4): patch trafficShare and/or sync-async kind. */
  updateEdge: (
    id: string,
    patch: Partial<Pick<DesignEdge, "trafficShare" | "kind">>,
  ) => void;
  setGraph: (graph: DesignGraph) => void;
}

function defaultConfig(
  kind: ComponentKind,
): Record<string, number | string | boolean> {
  const config: Record<string, number | string | boolean> = {};
  for (const field of getComponentDef(kind).configFields) {
    config[field.key] = field.default;
  }
  return config;
}

export function emptyGraph(): DesignGraph {
  return { nodes: [], edges: [], entryNodeId: "" };
}

function collectMeasurements(nodes: ComponentFlowNode[]): NodeMeasurements {
  const measured: NodeMeasurements = {};
  for (const n of nodes) {
    if (n.measured?.width != null && n.measured?.height != null) {
      measured[n.id] = { width: n.measured.width, height: n.measured.height };
    }
  }
  return measured;
}

export const useDesignStore = create<DesignStore>((set) => ({
  graph: emptyGraph(),
  selectedNodeIds: [],
  selectedEdgeIds: [],
  measured: {},

  onNodesChange: (changes) =>
    set((s) => {
      const { nodes, edges } = toFlow(
        s.graph,
        s.selectedNodeIds,
        s.measured,
        s.selectedEdgeIds,
      );
      const nextNodes = applyNodeChanges(changes, nodes);
      return {
        graph: fromFlow(nextNodes, edges, s.graph.entryNodeId),
        selectedNodeIds: nextNodes.filter((n) => n.selected).map((n) => n.id),
        measured: collectMeasurements(nextNodes),
      };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const { nodes, edges } = toFlow(
        s.graph,
        s.selectedNodeIds,
        s.measured,
        s.selectedEdgeIds,
      );
      const nextEdges = applyEdgeChanges(changes, edges);
      return {
        graph: fromFlow(nodes, nextEdges, s.graph.entryNodeId),
        selectedEdgeIds: nextEdges.filter((e) => e.selected).map((e) => e.id),
      };
    }),

  onConnect: (connection) =>
    set((s) => {
      const duplicate = s.graph.edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return {};
      const edge: DesignEdge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        trafficShare: 1,
        kind: "sync",
      };
      return { graph: { ...s.graph, edges: [...s.graph.edges, edge] } };
    }),

  addNode: (kind, position) => {
    const id = crypto.randomUUID();
    set((s) => ({
      graph: {
        ...s.graph,
        nodes: [
          ...s.graph.nodes,
          {
            id,
            kind,
            label: getComponentDef(kind).label,
            position,
            config: defaultConfig(kind),
          },
        ],
        entryNodeId:
          s.graph.entryNodeId === "" && kind === "client"
            ? id
            : s.graph.entryNodeId,
      },
    }));
    return id;
  },

  updateEdge: (id, patch) =>
    set((s) => ({
      graph: {
        ...s.graph,
        edges: s.graph.edges.map((e) =>
          e.id === id ? { ...e, ...patch } : e,
        ),
      },
    })),

  setGraph: (graph) =>
    set({ graph, selectedNodeIds: [], selectedEdgeIds: [], measured: {} }),
}));
