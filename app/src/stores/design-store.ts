import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";
import type {
  ActionEvent,
  BoardPhase,
  ComponentKind,
  DesignBoards,
  DesignEdge,
  DesignGraph,
  Phase,
} from "@/lib/core";
import {
  boardEditedAction,
  diffGraph,
  phaseStartedAction,
  stampAction,
  type DraftAction,
} from "@/lib/actions";
import { getComponentDef, isSplitSource } from "@/lib/registry";
import {
  buildDesignRecord,
  DEFAULT_DESIGN_MODE,
  emptyPhaseNotes,
  loadDesign,
  saveDesign,
  type DesignMode,
  type DesignRecord,
} from "@/persistence/local";
import { BOARD_PHASES, emptyBoards } from "@/persistence/boards";
import { createBoardActions, type BoardActions } from "./board-actions";
import {
  fromFlow,
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
  type NodeMeasurements,
} from "./flow-adapter";
import { usePhaseStore } from "./phase-store";

const DEFAULT_DESIGN_NAME = "Untitled design";

interface DesignStore extends BoardActions {
  graph: DesignGraph;
  /** localStorage slot this session autosaves to; null until a page attaches. */
  designId: string | null;
  designName: string;
  /**
   * Mode of the attached design (T-7.2). Set only by attachDesign; importRecord
   * keeps it (importing never converts a mode). Meaningful once designId is set.
   */
  designMode: DesignMode;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  /** DOM sizes reported by React Flow — must be echoed back or nodes stay hidden. */
  measured: NodeMeasurements;
  /** Per-phase markdown notes (T-4.2); persisted in the design record. */
  phaseNotes: Record<Phase, string>;
  /** Step boards (M13); persisted in the design record. Edit via the BoardActions. */
  boards: DesignBoards;
  /** Recorded candidate actions (T-4.3); persisted in the design record. */
  actionLog: ActionEvent[];
  /**
   * Graph reference after each recorded action, aligned to `actionLog` by index
   * (T-4.5 review-screen snapshots). In-memory only — never persisted, reset on
   * attach/import; empty after a cold reload. Zero-copy: the store never mutates a
   * graph in place, so each entry just references that action's immutable graph.
   */
  actionSnapshots: DesignGraph[];
  onNodesChange: (changes: NodeChange<ComponentFlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<ComponentFlowEdge>[]) => void;
  /** Creates a sync edge: split (lb) sources get an auto share and rebalance (T-6.1), call sources get callsPerRequest 1 (T-8.3); duplicate source→target is a no-op. */
  onConnect: (connection: Connection) => void;
  /** Creates a node with registry defaults; returns its id. Used by the palette (T-1.3). */
  addNode: (kind: ComponentKind, position: { x: number; y: number }) => string;
  /**
   * Edge inspector (T-1.4): patch trafficShare, sync-async kind, and/or
   * autoShare (T-6.1) on split (lb) edges, or callsPerRequest on call edges
   * (T-8.3). LB-source edges rebalance after the patch, so an auto edge's
   * trafficShare is always store-computed — to pin a share, pass
   * autoShare: false alongside it. Timeouts/retries (T-8.5): `undefined`
   * for timeoutMs/retries removes the key.
   */
  updateEdge: (
    id: string,
    patch: Partial<
      Pick<
        DesignEdge,
        | "trafficShare"
        | "autoShare"
        | "callsPerRequest"
        | "kind"
        | "timeoutMs"
        | "retries"
        | "breaker"
      >
    >,
  ) => void;
  /** Config panel (T-1.5): set one config key on a node. */
  updateNodeConfig: (
    id: string,
    key: string,
    value: number | string | boolean,
  ) => void;
  renameNode: (id: string, label: string) => void;
  /** Inspector close button (T-12.8): deselect every node and edge. */
  clearSelection: () => void;
  /** Phase notes panel (T-4.2): set the markdown note for one phase. */
  setPhaseNote: (phase: Phase, md: string) => void;
  /** Append a fully-stamped action event to the log. */
  recordAction: (event: ActionEvent) => void;
  /** Bind this session to a design id and load its autosaved record, if any. */
  attachDesign: (id: string) => void;
  /** Adopt an imported file's graph, name, notes, boards and log; the attached designId and designMode are kept (in-place import never converts a mode). */
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

/**
 * T-6.1: recompute one split source's (lb) auto outbound shares — auto edges (autoShare !==
 * false) evenly divide max(0, 1 − Σ manual shares). No-op for non-lb sources
 * and for LBs with no auto edges, so call sites invoke it unconditionally.
 * Never called from attachDesign/importRecord/setGraph: loads and imports keep
 * their stored shares until the next edit.
 */
export function rebalanceLb(graph: DesignGraph, sourceNodeId: string): DesignGraph {
  const node = graph.nodes.find((n) => n.id === sourceNodeId);
  if (!isSplitSource(node?.kind)) return graph;
  const outbound = graph.edges.filter((e) => e.source === sourceNodeId);
  const autoCount = outbound.filter((e) => e.autoShare !== false).length;
  if (autoCount === 0) return graph;
  const manualSum = outbound
    .filter((e) => e.autoShare === false)
    .reduce((acc, e) => acc + (e.trafficShare ?? 1), 0);
  const share = Math.max(0, 1 - manualSum) / autoCount;
  return {
    ...graph,
    edges: graph.edges.map((e) =>
      e.source === sourceNodeId && e.autoShare !== false
        ? { ...e, trafficShare: share }
        : e,
    ),
  };
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

// Bulk graph replaces (attach/import/setGraph) must not be recorded as candidate
// edits. Zustand fires subscribers synchronously inside set(), so a module flag
// toggled around the set() call suppresses the recording subscription below.
let recordingSuspended = false;
function withoutRecording(mutate: () => void): void {
  recordingSuspended = true;
  try {
    mutate();
  } finally {
    recordingSuspended = false;
  }
}

const CLEARABLE_EDGE_KEYS = ["timeoutMs", "retries", "breaker"] as const;

/** Merge an updateEdge patch; an explicit undefined on a clearable key removes it (T-8.5; breaker T-8.6). */
function applyEdgePatch(
  edge: DesignEdge,
  patch: Parameters<DesignStore["updateEdge"]>[1],
): DesignEdge {
  const next: DesignEdge = { ...edge, ...patch };
  for (const key of CLEARABLE_EDGE_KEYS) {
    if (key in patch && patch[key] === undefined) delete next[key];
  }
  return next;
}

const BOARD_RECORD_DEBOUNCE_MS = 1000;
const boardRecordTimers: Partial<Record<BoardPhase, ReturnType<typeof setTimeout>>> = {};

/** One board_edited per burst per board (like note_edited). */
function scheduleBoardEditRecord(board: BoardPhase): void {
  clearTimeout(boardRecordTimers[board]);
  boardRecordTimers[board] = setTimeout(() => {
    delete boardRecordTimers[board];
    recordInterviewAction(boardEditedAction(board));
  }, BOARD_RECORD_DEBOUNCE_MS);
}

/** Drop pending board_edited records (attach/import must not record into the new design). */
function cancelBoardEditRecords(): void {
  for (const board of BOARD_PHASES) {
    clearTimeout(boardRecordTimers[board]);
    delete boardRecordTimers[board];
  }
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  graph: emptyGraph(),
  designId: null,
  designName: DEFAULT_DESIGN_NAME,
  designMode: DEFAULT_DESIGN_MODE,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  measured: {},
  phaseNotes: emptyPhaseNotes(),
  boards: emptyBoards(),
  actionLog: [],
  actionSnapshots: [],

  onNodesChange: (changes) =>
    set((s) => {
      const { nodes, edges } = toFlow(
        s.graph,
        s.selectedNodeIds,
        s.measured,
        s.selectedEdgeIds,
      );
      const nextNodes = applyNodeChanges(changes, nodes);
      let graph = fromFlow(nextNodes, edges, s.graph.entryNodeId);
      // fromFlow drops edges whose endpoint was removed (no onEdgesChange
      // round-trip), so LBs that lost a backend must rebalance here (T-6.1).
      const removedIds = new Set(
        changes.filter((c) => c.type === "remove").map((c) => c.id),
      );
      if (removedIds.size > 0) {
        const affectedSources = new Set(
          s.graph.edges
            .filter((e) => removedIds.has(e.target) && !removedIds.has(e.source))
            .map((e) => e.source),
        );
        for (const src of affectedSources) graph = rebalanceLb(graph, src);
      }
      return {
        graph,
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
      let graph = fromFlow(nodes, nextEdges, s.graph.entryNodeId);
      const removedSources = new Set(
        changes
          .filter((c) => c.type === "remove")
          .map((c) => s.graph.edges.find((e) => e.id === c.id)?.source)
          .filter((src): src is string => src !== undefined),
      );
      for (const src of removedSources) graph = rebalanceLb(graph, src);
      return {
        graph,
        selectedEdgeIds: nextEdges.filter((e) => e.selected).map((e) => e.id),
      };
    }),

  onConnect: (connection) =>
    set((s) => {
      const duplicate = s.graph.edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return {};
      const split = isSplitSource(
        s.graph.nodes.find((n) => n.id === connection.source)?.kind,
      );
      const edge: DesignEdge = {
        id: crypto.randomUUID(),
        source: connection.source,
        target: connection.target,
        kind: "sync",
        ...(split ? { trafficShare: 1, autoShare: true } : { callsPerRequest: 1 }),
      };
      const graph = { ...s.graph, edges: [...s.graph.edges, edge] };
      return { graph: rebalanceLb(graph, connection.source) };
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
    set((s) => {
      const target = s.graph.edges.find((e) => e.id === id);
      if (!target) return {};
      const graph = {
        ...s.graph,
        edges: s.graph.edges.map((e) =>
          e.id === id ? applyEdgePatch(e, patch) : e,
        ),
      };
      return { graph: rebalanceLb(graph, target.source) };
    }),

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

  clearSelection: () => set({ selectedNodeIds: [], selectedEdgeIds: [] }),

  setPhaseNote: (phase, md) =>
    set((s) => ({ phaseNotes: { ...s.phaseNotes, [phase]: md } })),

  recordAction: (event) =>
    set((s) => ({
      actionLog: [...s.actionLog, event],
      actionSnapshots: [...s.actionSnapshots, s.graph],
    })),

  attachDesign: (id) => {
    const record = loadDesign(id);
    cancelBoardEditRecords();
    withoutRecording(() =>
      set({
        designId: id,
        designName: record?.name ?? DEFAULT_DESIGN_NAME,
        designMode: record?.mode ?? DEFAULT_DESIGN_MODE,
        graph: record?.graph ?? emptyGraph(),
        selectedNodeIds: [],
        selectedEdgeIds: [],
        measured: {},
        phaseNotes: record?.phaseNotes ?? emptyPhaseNotes(),
        boards: record?.boards ?? emptyBoards(),
        actionLog: record?.actionLog ?? [],
        actionSnapshots: [],
      }),
    );
  },

  importRecord: (record) => {
    cancelBoardEditRecords();
    withoutRecording(() =>
      set({
        graph: record.graph,
        designName: record.name,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        measured: {},
        phaseNotes: record.phaseNotes,
        boards: record.boards,
        actionLog: record.actionLog,
        actionSnapshots: [],
      }),
    );
  },

  setGraph: (graph) =>
    withoutRecording(() =>
      set({ graph, selectedNodeIds: [], selectedEdgeIds: [], measured: {} }),
    ),

  ...createBoardActions(
    () => get().boards,
    (boards) => set({ boards }),
    scheduleBoardEditRecord,
    () => get().designId !== null,
  ),
}));

/**
 * Stamp a draft action with the interview clock (phase-store) and append it to the
 * attached design's log. No-ops when no design is attached, so recording only
 * happens during a live interview. Quick designs never record.
 */
export function recordInterviewAction(draft: DraftAction): void {
  const store = useDesignStore.getState();
  // Quick mode has no interview timeline (T-7.5): nothing is recorded.
  if (store.designId === null || store.designMode === "quick") return;
  const { elapsedSec, phase } = usePhaseStore.getState();
  store.recordAction(stampAction(draft, elapsedSec, phase));
}

const AUTOSAVE_DELAY_MS = 500;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

// Debounced localStorage autosave. Attaching (designId change) is not a user
// edit — skipping it avoids echo-saving a just-loaded record.
useDesignStore.subscribe((state, prev) => {
  if (state.designId === null || state.designId !== prev.designId) return;
  if (
    state.graph === prev.graph &&
    state.designName === prev.designName &&
    state.phaseNotes === prev.phaseNotes &&
    state.boards === prev.boards &&
    state.actionLog === prev.actionLog
  ) {
    return;
  }
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const s = useDesignStore.getState();
    if (s.designId === null) return;
    saveDesign(
      buildDesignRecord(
        s.designId,
        s.designName,
        s.graph,
        s.designMode,
        s.phaseNotes,
        s.actionLog,
        s.boards,
      ),
    );
  }, AUTOSAVE_DELAY_MS);
});

// Record graph mutations (node/edge add-remove, rename, config) as ActionEvents.
// Diffs prev→next graph, so position drags and selection changes emit nothing.
// Suspended during bulk replaces (attach/import/setGraph); no-ops with no design.
useDesignStore.subscribe((state, prev) => {
  if (recordingSuspended || state.graph === prev.graph) return;
  for (const draft of diffGraph(prev.graph, state.graph)) {
    recordInterviewAction(draft);
  }
});

// Record interview phase transitions (skip or auto-advance) as phase_started —
// only on the attached design's own clock (T-12.7): restoring a saved phase on
// attach, or the landing's reset() of a detached clock, records nothing.
usePhaseStore.subscribe((state, prev) => {
  if (state.phase === prev.phase) return;
  if (state.designId !== prev.designId) return;
  if (state.designId !== useDesignStore.getState().designId) return;
  recordInterviewAction(phaseStartedAction(state.phase));
});
