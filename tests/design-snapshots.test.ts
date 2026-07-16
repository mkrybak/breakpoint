import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  usePhaseStore.setState({ phase: "hld", elapsedSec: 100, running: false });
  useDesignStore.getState().attachDesign("snap"); // recording active; starts empty
});

afterEach(() => vi.unstubAllGlobals());

describe("action snapshots", () => {
  it("captures a graph aligned to each recorded action", () => {
    const store = useDesignStore.getState();
    const appId = store.addNode("app_server", { x: 0, y: 0 });
    store.updateNodeConfig(appId, "replicas", 3);
    store.addNode("cache", { x: 10, y: 0 });

    const s = useDesignStore.getState();
    expect(s.actionSnapshots).toHaveLength(s.actionLog.length);
    // First recorded action was the app_server add → one node at that moment.
    expect(s.actionSnapshots[0].nodes).toHaveLength(1);
    // The latest snapshot is the current graph (two nodes now).
    expect(s.actionSnapshots.at(-1)).toEqual(s.graph);
    expect(s.graph.nodes).toHaveLength(2);
  });

  it("resets snapshots on attach", () => {
    useDesignStore.getState().addNode("cache", { x: 0, y: 0 });
    expect(useDesignStore.getState().actionSnapshots.length).toBeGreaterThan(0);
    useDesignStore.getState().attachDesign("other");
    expect(useDesignStore.getState().actionSnapshots).toEqual([]);
  });
});
