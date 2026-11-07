import { describe, expect, it } from "vitest";
import type { DesignGraph } from "../src/lib/core/index";
import { fromFlow, toFlow } from "../src/stores/flow-adapter";

describe("flow-adapter", () => {
  it("round-trip preserves the graph", () => {
    const graph: DesignGraph = {
      nodes: [
        {
          id: "n1",
          kind: "app_server",
          label: "App",
          position: { x: 0, y: 0 },
          config: { replicas: 3 },
        },
        {
          id: "n2",
          kind: "db_sql",
          label: "DB",
          position: { x: 100, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          callsPerRequest: 0.5,
          kind: "async",
        },
      ],
      entryNodeId: "n1",
    };

    const { nodes, edges } = toFlow(graph, []);
    expect(fromFlow(nodes, edges, graph.entryNodeId)).toEqual(graph);
  });

  it("toFlow marks selection and shape", () => {
    const graph: DesignGraph = {
      nodes: [
        {
          id: "n1",
          kind: "client",
          label: "Client",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "n2",
          kind: "lb",
          label: "LB",
          position: { x: 100, y: 0 },
          config: {},
        },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", callsPerRequest: 1, kind: "sync" },
      ],
      entryNodeId: "n1",
    };

    const { nodes, edges } = toFlow(graph, ["n1"], {}, ["e1"]);

    expect(nodes.find((n) => n.id === "n1")?.selected).toBe(true);
    expect(nodes.find((n) => n.id === "n2")?.selected).toBe(false);
    expect(nodes.every((n) => n.type === "component")).toBe(true);
    expect(edges.every((e) => e.type === "flow")).toBe(true);
    expect(edges[0].selected).toBe(true);
    expect(edges[0].data).toEqual({
      kind: "sync",
      callsPerRequest: 1,
      sourceKind: "client",
    });
  });

  it("fromFlow prunes dangling edges", () => {
    const { nodes } = toFlow(
      {
        nodes: [
          {
            id: "n1",
            kind: "client",
            label: "Client",
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
        entryNodeId: "n1",
      },
      [],
    );

    const danglingEdges = [
      {
        id: "e1",
        source: "n1",
        target: "n-missing",
        animated: true,
        data: { kind: "sync" as const },
      },
    ];

    const result = fromFlow(nodes, danglingEdges, "n1");
    expect(result.edges).toEqual([]);
  });

  describe("entryNodeId resolution", () => {
    it("keeps previous id when still present", () => {
      const { nodes } = toFlow(
        {
          nodes: [
            {
              id: "n1",
              kind: "client",
              label: "Client",
              position: { x: 0, y: 0 },
              config: {},
            },
            {
              id: "n2",
              kind: "lb",
              label: "LB",
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
          entryNodeId: "n1",
        },
        [],
      );
      expect(fromFlow(nodes, [], "n2").entryNodeId).toBe("n2");
    });

    it("falls back to a client-kind node when previous is gone", () => {
      const { nodes } = toFlow(
        {
          nodes: [
            {
              id: "n1",
              kind: "client",
              label: "Client",
              position: { x: 0, y: 0 },
              config: {},
            },
            {
              id: "n2",
              kind: "lb",
              label: "LB",
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
          entryNodeId: "n1",
        },
        [],
      );
      expect(fromFlow(nodes, [], "n-gone").entryNodeId).toBe("n1");
    });

    it("falls back to empty string when no client node exists", () => {
      const { nodes } = toFlow(
        {
          nodes: [
            {
              id: "n2",
              kind: "lb",
              label: "LB",
              position: { x: 0, y: 0 },
              config: {},
            },
          ],
          edges: [],
          entryNodeId: "n2",
        },
        [],
      );
      expect(fromFlow(nodes, [], "n-gone").entryNodeId).toBe("");
    });
  });

  it("edge data defaults when data is undefined", () => {
    const { nodes } = toFlow(
      {
        nodes: [
          {
            id: "n1",
            kind: "client",
            label: "Client",
            position: { x: 0, y: 0 },
            config: {},
          },
          {
            id: "n2",
            kind: "lb",
            label: "LB",
            position: { x: 0, y: 0 },
            config: {},
          },
        ],
        edges: [],
        entryNodeId: "n1",
      },
      [],
    );

    const edges = [{ id: "e1", source: "n1", target: "n2" }];
    const result = fromFlow(nodes, edges, "n1");
    expect(result.edges).toEqual([
      { id: "e1", source: "n1", target: "n2", kind: "sync" },
    ]);
  });

  it("round-trips autoShare and threads sourceKind (T-6.1)", () => {
    const graph: DesignGraph = {
      nodes: [
        { id: "n-lb", kind: "lb", label: "LB", position: { x: 0, y: 0 }, config: {} },
        { id: "n-a", kind: "app_server", label: "A", position: { x: 100, y: 0 }, config: {} },
        { id: "n-b", kind: "app_server", label: "B", position: { x: 100, y: 100 }, config: {} },
      ],
      edges: [
        { id: "e-a", source: "n-lb", target: "n-a", trafficShare: 0.5, kind: "sync", autoShare: true },
        { id: "e-b", source: "n-lb", target: "n-b", trafficShare: 0.5, kind: "sync", autoShare: false },
      ],
      entryNodeId: "",
    };

    const { nodes, edges } = toFlow(graph, []);
    expect(edges[0].data?.sourceKind).toBe("lb");
    expect(edges[0].data?.autoShare).toBe(true);
    expect(edges[1].data?.autoShare).toBe(false);
    // absent-vs-present autoShare survives the round-trip exactly
    expect(fromFlow(nodes, edges, "")).toEqual(graph);
  });

  it("timeoutMs/retries survive a round-trip and stay absent when absent (T-8.5)", () => {
    const graph: DesignGraph = {
      nodes: [
        {
          id: "a",
          kind: "app_server",
          label: "App",
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: "b",
          kind: "app_server",
          label: "Dep",
          position: { x: 100, y: 0 },
          config: {},
        },
        {
          id: "c",
          kind: "db_sql",
          label: "DB",
          position: { x: 200, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          kind: "sync",
          callsPerRequest: 1,
          timeoutMs: 200,
          retries: 3,
        },
        {
          id: "e2",
          source: "b",
          target: "c",
          kind: "sync",
          callsPerRequest: 1,
        },
      ],
      entryNodeId: "a",
    };
    const { nodes, edges } = toFlow(graph, []);
    expect(fromFlow(nodes, edges, graph.entryNodeId).edges).toStrictEqual(
      graph.edges,
    );
  });

  it("breaker survives a round-trip and stays absent when absent (T-8.6)", () => {
    const nodes = ["a", "b", "c"].map((id, k) => ({
      id,
      kind: "app_server" as const,
      label: id,
      position: { x: k * 100, y: 0 },
      config: {},
    }));
    const graph: DesignGraph = {
      nodes,
      edges: [
        {
          id: "e1",
          source: "a",
          target: "b",
          kind: "sync",
          callsPerRequest: 1,
          breaker: { errorThreshold: 0.5, tripAfterSec: 0.5, cooldownSec: 5 },
        },
        { id: "e2", source: "b", target: "c", kind: "sync", callsPerRequest: 1 },
      ],
      entryNodeId: "a",
    };
    const { nodes: flowNodes, edges } = toFlow(graph, []);
    const back = fromFlow(flowNodes, edges, graph.entryNodeId).edges;
    expect(back).toStrictEqual(graph.edges);
    expect("breaker" in back[1]).toBe(false);
  });
});
