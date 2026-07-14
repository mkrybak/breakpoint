import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignGraph } from "../src/lib/core";
import {
  buildDesignRecord,
  designStorageKey,
} from "../src/persistence/local";
import { emptyGraph, useDesignStore } from "../src/stores/design-store";
import { toFlow } from "../src/stores/flow-adapter";

/** The former demo seed (client → lb → app), kept as the test fixture. */
function fixtureGraph(): DesignGraph {
  return {
    nodes: [
      {
        id: "n-client",
        kind: "client" as const,
        label: "Client",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n-lb",
        kind: "lb" as const,
        label: "Load balancer",
        position: { x: 260, y: 120 },
        config: {},
      },
      {
        id: "n-app",
        kind: "app_server" as const,
        label: "App server",
        position: { x: 520, y: 240 },
        config: { replicas: 1 },
      },
    ],
    edges: [
      {
        id: "e-client-lb",
        source: "n-client",
        target: "n-lb",
        trafficShare: 1,
        kind: "sync" as const,
      },
      {
        id: "e-lb-app",
        source: "n-lb",
        target: "n-app",
        trafficShare: 1,
        kind: "sync" as const,
      },
    ],
    entryNodeId: "n-client",
  };
}

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
  useDesignStore.setState({
    graph: fixtureGraph(),
    designId: null,
    designName: "Untitled design",
    selectedNodeIds: [],
    selectedEdgeIds: [],
    measured: {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("design-store", () => {
  it("assigns entryNodeId when the first client lands on an empty graph", () => {
    useDesignStore.setState({
      graph: emptyGraph(),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      measured: {},
    });
    const cacheId = useDesignStore.getState().addNode("cache", { x: 0, y: 0 });
    expect(cacheId).toBeTruthy();
    expect(useDesignStore.getState().graph.entryNodeId).toBe("");

    const clientId = useDesignStore
      .getState()
      .addNode("client", { x: 0, y: 0 });
    expect(useDesignStore.getState().graph.entryNodeId).toBe(clientId);
  });

  it("addNode creates a node with registry defaults", () => {
    const id = useDesignStore.getState().addNode("cache", { x: 10, y: 20 });
    expect(id).toBeTruthy();

    const node = useDesignStore
      .getState()
      .graph.nodes.find((n) => n.id === id);
    expect(node).toBeDefined();
    expect(node?.label).toBe("Cache");
    expect(node?.config).toEqual({ replicas: 1, hitRate: 0.8 });
  });

  it("updates node position on a position change", () => {
    useDesignStore.getState().onNodesChange([
      { id: "n-lb", type: "position", position: { x: 300, y: 150 } },
    ]);
    const node = useDesignStore
      .getState()
      .graph.nodes.find((n) => n.id === "n-lb");
    expect(node?.position).toEqual({ x: 300, y: 150 });
  });

  it("cascades delete to dangling edges", () => {
    useDesignStore.getState().onNodesChange([{ id: "n-lb", type: "remove" }]);
    const { graph } = useDesignStore.getState();
    expect(graph.nodes.find((n) => n.id === "n-lb")).toBeUndefined();
    expect(graph.edges).toHaveLength(0);
    expect(graph.entryNodeId).toBe("n-client");
  });

  it("reassigns entryNodeId to empty string when the entry client is removed", () => {
    useDesignStore
      .getState()
      .onNodesChange([{ id: "n-client", type: "remove" }]);
    expect(useDesignStore.getState().graph.entryNodeId).toBe("");
  });

  // React Flow hides nodes (visibility: hidden) until their measured dimensions
  // are echoed back on the nodes prop — measurements must survive the round-trip.
  it("keeps node measurements across the store round-trip", () => {
    useDesignStore.getState().onNodesChange([
      {
        id: "n-client",
        type: "dimensions",
        dimensions: { width: 176, height: 60 },
      },
    ]);
    const { graph, selectedNodeIds, measured } = useDesignStore.getState();
    expect(measured["n-client"]).toEqual({ width: 176, height: 60 });

    const { nodes } = toFlow(graph, selectedNodeIds, measured);
    expect(nodes.find((n) => n.id === "n-client")?.measured).toEqual({
      width: 176,
      height: 60,
    });
  });

  it("tracks selection", () => {
    useDesignStore
      .getState()
      .onNodesChange([{ id: "n-app", type: "select", selected: true }]);
    expect(useDesignStore.getState().selectedNodeIds).toEqual(["n-app"]);
  });

  it("onConnect creates a sync edge with full traffic share; duplicates are no-ops", () => {
    const connection = {
      source: "n-client",
      target: "n-app",
      sourceHandle: null,
      targetHandle: null,
    };
    useDesignStore.getState().onConnect(connection);
    const { edges } = useDesignStore.getState().graph;
    expect(edges).toHaveLength(3);
    expect(
      edges.find((e) => e.source === "n-client" && e.target === "n-app"),
    ).toMatchObject({ trafficShare: 1, kind: "sync" });

    useDesignStore.getState().onConnect(connection);
    expect(useDesignStore.getState().graph.edges).toHaveLength(3);
  });

  it("updateEdge patches trafficShare and kind", () => {
    useDesignStore
      .getState()
      .updateEdge("e-lb-app", { trafficShare: 0.5, kind: "async" });
    const edge = useDesignStore
      .getState()
      .graph.edges.find((e) => e.id === "e-lb-app");
    expect(edge).toMatchObject({ trafficShare: 0.5, kind: "async" });
  });

  it("tracks edge selection", () => {
    useDesignStore
      .getState()
      .onEdgesChange([{ id: "e-lb-app", type: "select", selected: true }]);
    expect(useDesignStore.getState().selectedEdgeIds).toEqual(["e-lb-app"]);
  });

  it("updateNodeConfig patches a single config key", () => {
    useDesignStore.getState().updateNodeConfig("n-app", "replicas", 4);
    const node = useDesignStore
      .getState()
      .graph.nodes.find((n) => n.id === "n-app");
    expect(node?.config).toEqual({ replicas: 4 });
  });

  it("renameNode updates the label", () => {
    useDesignStore.getState().renameNode("n-app", "API tier");
    const node = useDesignStore
      .getState()
      .graph.nodes.find((n) => n.id === "n-app");
    expect(node?.label).toBe("API tier");
  });

  it("attachDesign loads the persisted record", () => {
    const record = buildDesignRecord("d1", "Saved design", fixtureGraph());
    localStorage.setItem(designStorageKey("d1"), JSON.stringify(record));

    useDesignStore.getState().attachDesign("d1");
    const s = useDesignStore.getState();
    expect(s.designId).toBe("d1");
    expect(s.designName).toBe("Saved design");
    expect(s.graph).toEqual(fixtureGraph());
  });

  it("attachDesign starts empty when nothing is stored", () => {
    useDesignStore.getState().attachDesign("d-fresh");
    const s = useDesignStore.getState();
    expect(s.designId).toBe("d-fresh");
    expect(s.designName).toBe("Untitled design");
    expect(s.graph).toEqual(emptyGraph());
  });

  it("importRecord adopts graph and name but keeps the attached id", () => {
    useDesignStore.setState({ designId: "current" });
    const record = buildDesignRecord("other-id", "Imported", fixtureGraph());

    useDesignStore.getState().importRecord(record);
    const s = useDesignStore.getState();
    expect(s.designId).toBe("current");
    expect(s.designName).toBe("Imported");
    expect(s.graph).toEqual(fixtureGraph());
    expect(s.selectedNodeIds).toEqual([]);
  });

  it("autosaves to localStorage after edits settle", () => {
    vi.useFakeTimers();
    try {
      useDesignStore.getState().attachDesign("d-auto");
      useDesignStore.getState().addNode("cache", { x: 0, y: 0 });
      expect(localStorage.getItem(designStorageKey("d-auto"))).toBeNull();

      vi.advanceTimersByTime(600);
      const stored = localStorage.getItem(designStorageKey("d-auto"));
      expect(stored).not.toBeNull();
      const record = JSON.parse(stored ?? "{}") as {
        graph: { nodes: unknown[] };
      };
      expect(record.graph.nodes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
