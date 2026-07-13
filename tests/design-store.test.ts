import { beforeEach, describe, expect, it } from "vitest";
import type { DesignGraph } from "../src/lib/core";
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

beforeEach(() => {
  useDesignStore.setState({
    graph: fixtureGraph(),
    selectedNodeIds: [],
    selectedEdgeIds: [],
    measured: {},
  });
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
});
