import { beforeEach, describe, expect, it } from "vitest";
import { seedGraph, useDesignStore } from "../src/stores/design-store";

beforeEach(() => {
  useDesignStore.setState({ graph: seedGraph(), selectedNodeIds: [] });
});

describe("design-store", () => {
  it("seeds with 3 nodes, 2 edges, entryNodeId n-client", () => {
    const { graph } = useDesignStore.getState();
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.entryNodeId).toBe("n-client");
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

  it("tracks selection", () => {
    useDesignStore
      .getState()
      .onNodesChange([{ id: "n-app", type: "select", selected: true }]);
    expect(useDesignStore.getState().selectedNodeIds).toEqual(["n-app"]);
  });
});
