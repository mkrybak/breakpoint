import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import type { ComponentKind, DesignGraph } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  fromFlow,
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
} from "./flow-adapter";

interface DesignStore {
  graph: DesignGraph;
  selectedNodeIds: string[];
  onNodesChange: (changes: NodeChange<ComponentFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ComponentFlowEdge>[]) => void;
  /** Creates a node with registry defaults; returns its id. Used by the palette (T-1.3). */
  addNode: (kind: ComponentKind, position: { x: number; y: number }) => string;
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

/** Demo seed so the canvas isn't empty before the palette exists (T-1.3). */
export function seedGraph(): DesignGraph {
  return {
    nodes: [
      {
        id: "n-client",
        kind: "client",
        label: "Client",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n-lb",
        kind: "lb",
        label: "Load balancer",
        position: { x: 260, y: 120 },
        config: {},
      },
      {
        id: "n-app",
        kind: "app_server",
        label: "App server",
        position: { x: 520, y: 240 },
        config: defaultConfig("app_server"),
      },
    ],
    edges: [
      {
        id: "e-client-lb",
        source: "n-client",
        target: "n-lb",
        trafficShare: 1,
        kind: "sync",
      },
      {
        id: "e-lb-app",
        source: "n-lb",
        target: "n-app",
        trafficShare: 1,
        kind: "sync",
      },
    ],
    entryNodeId: "n-client",
  };
}

export const useDesignStore = create<DesignStore>((set) => ({
  graph: seedGraph(),
  selectedNodeIds: [],

  onNodesChange: (changes) =>
    set((s) => {
      const { nodes, edges } = toFlow(s.graph, s.selectedNodeIds);
      const nextNodes = applyNodeChanges(changes, nodes);
      return {
        graph: fromFlow(nextNodes, edges, s.graph.entryNodeId),
        selectedNodeIds: nextNodes.filter((n) => n.selected).map((n) => n.id),
      };
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      const { nodes, edges } = toFlow(s.graph, s.selectedNodeIds);
      const nextEdges = applyEdgeChanges(changes, edges);
      return { graph: fromFlow(nodes, nextEdges, s.graph.entryNodeId) };
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

  setGraph: (graph) => set({ graph, selectedNodeIds: [] }),
}));
