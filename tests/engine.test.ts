import { describe, expect, it } from "vitest";
import type { DesignEdge, DesignGraph, DesignNode } from "../src/lib/core";
import {
  flowRps,
  propagateTraffic,
  scaleFlow,
  splitFlow,
  topoSort,
  zeroFlow,
} from "../src/lib/simulation/engine";

function node(
  id: string,
  kind: DesignNode["kind"] = "app_server",
  config: DesignNode["config"] = {},
): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config };
}

function edge(
  source: string,
  target: string,
  overrides: Partial<Pick<DesignEdge, "trafficShare" | "kind">> = {},
): DesignEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    trafficShare: overrides.trafficShare ?? 1,
    kind: overrides.kind ?? "sync",
  };
}

function graph(
  nodes: DesignNode[],
  edges: DesignEdge[],
  entryNodeId = "c",
): DesignGraph {
  return { nodes, edges, entryNodeId };
}

describe("splitFlow", () => {
  it("splits offered RPS by readRatio exactly", () => {
    expect(splitFlow(10000, 0.8)).toEqual({ read: 8000, write: 2000 });
  });

  it("read + write always equals the total, even for awkward ratios", () => {
    const f = splitFlow(999, 1 / 3);
    expect(f.read + f.write).toBe(999);
  });
});

describe("topoSort", () => {
  it("returns [] when the entry node does not exist", () => {
    expect(topoSort(graph([node("a")], [], ""))).toEqual([]);
  });

  it("orders a chain from the entry", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("app"), node("db", "db_sql")],
      [edge("c", "lb"), edge("lb", "app"), edge("app", "db")],
    );
    expect(topoSort(g)).toEqual(["c", "lb", "app", "db"]);
  });

  it("breaks ties by graph.nodes array order, not edge order", () => {
    const g = graph(
      [node("c", "client"), node("b"), node("a"), node("db", "db_sql")],
      [edge("c", "a"), edge("c", "b"), edge("a", "db"), edge("b", "db")],
    );
    expect(topoSort(g)).toEqual(["c", "b", "a", "db"]);
  });

  it("excludes nodes unreachable from the entry", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("x"), node("y")],
      [edge("c", "app"), edge("x", "y")],
    );
    expect(topoSort(g)).toEqual(["c", "app"]);
  });

  it("terminates on a cycle and orders each node once", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("b")],
      [edge("c", "a"), edge("a", "b"), edge("b", "a")],
    );
    expect(topoSort(g)).toEqual(["c", "a", "b"]);
  });
});

describe("propagateTraffic", () => {
  it("golden 2: cache 80% hit in front of DB — DB load = writes + 20% of reads", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const { perNode, perEdge } = propagateTraffic(g, splitFlow(10000, 0.8));
    expect(perEdge["e-c-cache"]).toEqual({ read: 8000, write: 2000 });
    expect(perNode["cache"].demand).toEqual({ read: 8000, write: 2000 });
    expect(perEdge["e-cache-db"]).toEqual({ read: 1600, write: 2000 });
    expect(perNode["db"].demand).toEqual({ read: 1600, write: 2000 });
    expect(flowRps(perNode["db"].demand)).toBe(3600);
  });

  it("falls back to the registry default hitRate when config is empty", () => {
    const g = graph(
      [node("c", "client"), node("cache", "cache"), node("db", "db_sql")],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const { perNode } = propagateTraffic(g, splitFlow(10000, 0.8));
    // registry default hitRate for cache is 0.8 — same numbers as golden 2
    expect(perNode["db"].demand).toEqual({ read: 1600, write: 2000 });
  });

  it("clamps config hitRate to the field's declared range", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 2 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const { perNode } = propagateTraffic(g, { read: 8000, write: 0 });
    // clamped to the field max 0.95: 8000 − 8000 × 0.95 = 400
    expect(perNode["db"].demand).toEqual({ read: 400, write: 0 });
  });

  it("ignores hitRate config on kinds that do not declare the field", () => {
    const g = graph(
      [node("c", "client"), node("app", "app_server", { hitRate: 0.9 }), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "db")],
    );
    const { perNode } = propagateTraffic(g, { read: 1000, write: 500 });
    expect(perNode["db"].demand).toEqual({ read: 1000, write: 500 });
  });

  it("splits traffic across outbound edges by trafficShare", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("a"), node("b")],
      [
        edge("c", "lb"),
        edge("lb", "a", { trafficShare: 0.5 }),
        edge("lb", "b", { trafficShare: 0.5 }),
      ],
    );
    const { perNode, perEdge } = propagateTraffic(g, { read: 1000, write: 1000 });
    expect(perEdge["e-lb-a"]).toEqual({ read: 500, write: 500 });
    expect(perEdge["e-lb-b"]).toEqual({ read: 500, write: 500 });
    expect(perNode["a"].demand).toEqual({ read: 500, write: 500 });
    expect(perNode["b"].demand).toEqual({ read: 500, write: 500 });
  });

  it("routes async edges into asyncArrivals, not sync demand", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app"),
        node("q", "queue"),
        node("w", "worker"),
      ],
      [
        edge("c", "app"),
        edge("app", "q", { kind: "async" }),
        edge("q", "w"),
      ],
    );
    const { perNode } = propagateTraffic(g, splitFlow(1000, 0));
    expect(perNode["q"].demand).toEqual(zeroFlow());
    expect(perNode["q"].asyncArrivals).toEqual({ read: 0, write: 1000 });
    // the queue forwards its inflow downstream in the same pass
    expect(perNode["w"].demand).toEqual({ read: 0, write: 1000 });
  });

  it("lets the serve hook cap what a node forwards (T-2.3 integration point)", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "db")],
    );
    const { perNode } = propagateTraffic(g, { read: 8000, write: 2000 }, (n, _def, inflow) =>
      n.kind === "app_server" ? scaleFlow(inflow, 0.5) : inflow,
    );
    expect(perNode["db"].demand).toEqual({ read: 4000, write: 1000 });
  });

  it("gives unreachable nodes and edges zero flow", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("x"), node("y")],
      [edge("c", "app"), edge("x", "y")],
    );
    const { perNode, perEdge } = propagateTraffic(g, { read: 100, write: 0 });
    expect(perNode["x"]).toEqual({ demand: zeroFlow(), asyncArrivals: zeroFlow() });
    expect(perEdge["e-x-y"]).toEqual(zeroFlow());
  });

  it("carries nothing along back edges in a cycle", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("b")],
      [edge("c", "a"), edge("a", "b"), edge("b", "a")],
    );
    const { perNode, perEdge } = propagateTraffic(g, { read: 100, write: 0 });
    expect(perEdge["e-b-a"]).toEqual(zeroFlow());
    expect(perNode["a"].demand).toEqual({ read: 100, write: 0 });
    expect(perNode["b"].demand).toEqual({ read: 100, write: 0 });
  });

  it("does not mutate the offered flow", () => {
    const g = graph([node("c", "client")], []);
    const offered = { read: 100, write: 50 };
    propagateTraffic(g, offered);
    expect(offered).toEqual({ read: 100, write: 50 });
  });
});
