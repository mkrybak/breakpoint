import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import type { ComponentKind, DesignEdge, DesignGraph, Phase } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  buildDesignRecord,
  emptyPhaseNotes,
  loadDesign,
  saveDesign,
  type DesignRecord,
} from "@/persistence/local";
import {
  fromFlow,
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
  type NodeMeasurements,
} from "./flow-adapter";

const DEFAULT_DESIGN_NAME = "Untitled design";

interface DesignStore {
  graph: DesignGraph;
  /** localStorage slot this session autosaves to; null until a page attaches. */
  designId: string | null;
  designName: string;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  /** DOM sizes reported by React Flow — must be echoed back or nodes stay hidden. */
  measured: NodeMeasurements;
  /** Per-phase markdown notes (T-4.2); persisted in the design record. */
  phaseNotes: Record<Phase, string>;
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
  /** Config panel (T-1.5): set one config key on a node. */
  updateNodeConfig: (
    id: string,
    key: string,
    value: number | string | boolean,
  ) => void;
  renameNode: (id: string, label: string) => void;
  /** Phase notes panel (T-4.2): set the markdown note for one phase. */
  setPhaseNote: (phase: Phase, md: string) => void;
  /** Bind this session to a design id and load its autosaved record, if any. */
  attachDesign: (id: string) => void;
  /** Adopt an imported file's graph + name; the attached designId is kept. */
  importRecord: (record: DesignRecord) => void;
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
  designId: null,
  designName: DEFAULT_DESIGN_NAME,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  measured: {},
  phaseNotes: emptyPhaseNotes(),

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

  updateNodeConfig: (id, key, value) =>
    set((s) => ({
      graph: {
        ...s.graph,
        nodes: s.graph.nodes.map((n) =>
          n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n,
        ),
      },
    })),

  renameNode: (id, label) =>
    set((s) => ({
      graph: {
        ...s.graph,
        nodes: s.graph.nodes.map((n) => (n.id === id ? { ...n, label } : n)),
      },
    })),

  setPhaseNote: (phase, md) =>
    set((s) => ({ phaseNotes: { ...s.phaseNotes, [phase]: md } })),

  attachDesign: (id) => {
    const record = loadDesign(id);
    set({
      designId: id,
      designName: record?.name ?? DEFAULT_DESIGN_NAME,
      graph: record?.graph ?? emptyGraph(),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      measured: {},
      phaseNotes: record?.phaseNotes ?? emptyPhaseNotes(),
    });
  },

  importRecord: (record) =>
    set({
      graph: record.graph,
      designName: record.name,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      measured: {},
      phaseNotes: record.phaseNotes,
    }),

  setGraph: (graph) =>
    set({ graph, selectedNodeIds: [], selectedEdgeIds: [], measured: {} }),
}));

const AUTOSAVE_DELAY_MS = 500;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

// Debounced localStorage autosave. Attaching (designId change) is not a user
// edit — skipping it avoids echo-saving a just-loaded record.
useDesignStore.subscribe((state, prev) => {
  if (state.designId === null || state.designId !== prev.designId) return;
  if (
    state.graph === prev.graph &&
    state.designName === prev.designName &&
    state.phaseNotes === prev.phaseNotes
  ) {
    return;
  }
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const s = useDesignStore.getState();
    if (s.designId === null) return;
    saveDesign(
      buildDesignRecord(s.designId, s.designName, s.graph, s.phaseNotes),
    );
  }, AUTOSAVE_DELAY_MS);
});
