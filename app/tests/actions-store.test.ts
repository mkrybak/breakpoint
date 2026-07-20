import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionEvent } from "../src/lib/core";
import { buildDesignRecord, designStorageKey } from "../src/persistence/local";
import { useDesignStore } from "../src/stores/design-store";
import { usePhaseStore } from "../src/stores/phase-store";

function createStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

/** The stored log, projected to the fields we assert on. */
function log(): Pick<ActionEvent, "phase" | "kind" | "detail">[] {
  return useDesignStore
    .getState()
    .actionLog.map((e) => ({ phase: e.phase, kind: e.kind, detail: e.detail }));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  // Fixed clock + phase so stamped events are deterministic.
  usePhaseStore.setState({ phase: "hld", elapsedSec: 100, running: false });
  // Attach a design (designId non-null → recording active); starts empty.
  useDesignStore.getState().attachDesign("rec");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("action recording", () => {
  it("records the exact event sequence for scripted store mutations", () => {
    const store = useDesignStore.getState();
    const appId = store.addNode("app_server", { x: 0, y: 0 });
    store.updateNodeConfig(appId, "replicas", 3);
    store.renameNode(appId, "API tier");
    const cacheId = store.addNode("cache", { x: 10, y: 0 });
    store.onConnect({
      source: appId,
      target: cacheId,
      sourceHandle: null,
      targetHandle: null,
    });
    // Removing the cache node cascades to the app→cache edge.
    store.onNodesChange([{ id: cacheId, type: "remove" }]);

    expect(log()).toEqual([
      { phase: "hld", kind: "node_added", detail: "added App server" },
      { phase: "hld", kind: "config_changed", detail: "set replicas: 3 on App server" },
      { phase: "hld", kind: "node_renamed", detail: "renamed App server → API tier" },
      { phase: "hld", kind: "node_added", detail: "added Cache" },
      { phase: "hld", kind: "edge_added", detail: "connected API tier → Cache" },
      { phase: "hld", kind: "node_removed", detail: "removed Cache" },
      { phase: "hld", kind: "edge_removed", detail: "disconnected API tier → Cache" },
    ]);
    expect(useDesignStore.getState().actionLog.every((e) => e.t === 100)).toBe(true);
  });

  it("does not record position drags or selection changes", () => {
    const store = useDesignStore.getState();
    store.addNode("app_server", { x: 0, y: 0 });
    const before = useDesignStore.getState().actionLog.length;
    const id = useDesignStore.getState().graph.nodes[0].id;
    store.onNodesChange([{ id, type: "position", position: { x: 99, y: 99 } }]);
    store.onNodesChange([{ id, type: "select", selected: true }]);
    expect(useDesignStore.getState().actionLog.length).toBe(before);
  });

  it("records a phase transition as phase_started for the entered phase", () => {
    usePhaseStore.setState({ phase: "hld" });
    usePhaseStore.getState().skip(); // hld → deepdive
    const last = useDesignStore.getState().actionLog.at(-1);
    expect(last).toMatchObject({
      kind: "phase_started",
      phase: "deepdive",
      detail: "entered deepdive",
    });
  });

  it("attachDesign loads a persisted log and does not re-record it", () => {
    const event: ActionEvent = {
      t: 5,
      phase: "requirements",
      kind: "node_added",
      detail: "added Client",
    };
    const record = buildDesignRecord(
      "loaded",
      "Loaded",
      { nodes: [], edges: [], entryNodeId: "" },
      undefined,
      [event],
    );
    localStorage.setItem(designStorageKey("loaded"), JSON.stringify(record));

    useDesignStore.getState().attachDesign("loaded");
    expect(useDesignStore.getState().actionLog).toEqual([event]);
  });

  it("importRecord adopts the log without recording node additions", () => {
    const record = buildDesignRecord(
      "other",
      "Imported",
      {
        nodes: [
          { id: "n1", kind: "client", label: "Client", position: { x: 0, y: 0 }, config: {} },
        ],
        edges: [],
        entryNodeId: "n1",
      },
      undefined,
      [],
    );
    useDesignStore.getState().importRecord(record);
    // The imported graph has a node, but importing is not a candidate edit.
    expect(useDesignStore.getState().actionLog).toEqual([]);
  });

  it("autosaves recorded actions to localStorage", () => {
    vi.useFakeTimers();
    try {
      useDesignStore.getState().addNode("cache", { x: 0, y: 0 });
      vi.advanceTimersByTime(600);
      const stored = localStorage.getItem(designStorageKey("rec"));
      const record = JSON.parse(stored ?? "{}") as { actionLog: ActionEvent[] };
      expect(record.actionLog).toHaveLength(1);
      expect(record.actionLog[0]).toMatchObject({
        kind: "node_added",
        detail: "added Cache",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
