import { describe, expect, it } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
} from "../src/lib/core";
import {
  flowRps,
  propagateTraffic,
  scaleFlow,
  simulate,
  splitFlow,
  topoSort,
  zeroFlow,
  type ApplyRulesFn,
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

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s",
    name: "s",
    description: "",
    durationSec: 1,
    baseRps: 2000,
    readRatio: 1,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01 },
    seed: 42,
    ...overrides,
  };
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

  it("books flow on dead (partitioned) edges as unroutable at the source", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const { perNode, perEdge, unroutable } = propagateTraffic(
      g,
      splitFlow(10000, 0.8),
      undefined,
      { deadEdges: ["e-cache-db"] },
    );
    expect(perEdge["e-cache-db"]).toEqual(zeroFlow());
    expect(perNode["db"].demand).toEqual(zeroFlow());
    expect(unroutable["cache"]).toEqual({ read: 1600, write: 2000 });
    expect(unroutable["db"]).toEqual(zeroFlow());
  });

  it("lets an effects hitRate override beat the node's config (flush)", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const { perNode } = propagateTraffic(g, splitFlow(10000, 0.8), undefined, {
      hitRate: { cache: 0 },
    });
    expect(perNode["db"].demand).toEqual({ read: 8000, write: 2000 });
  });
});

describe("simulate — golden 1 at frame level", () => {
  it("5k offered into a 4k server: queue fills, drops begin at tick 2", () => {
    const g = graph([node("c", "client"), node("app")], [edge("c", "app")]);
    const frames = simulate(g, scenario({ durationSec: 0.4, baseRps: 5000 }));
    expect(frames).toHaveLength(4);
    expect(frames.map((f) => f.t)).toEqual([0, 0.1, 0.2, 0.3]);
    const app = frames.map((f) => f.perNode["app"]);
    expect(app.map((n) => n.queued)).toEqual([1000, 2000, 2000, 2000]);
    expect(app.map((n) => n.dropped)).toEqual([0, 0, 1000, 1000]);
    expect(app.map((n) => n.util)).toEqual([1.25, 1.5, 1.75, 1.75]);
    expect(app.map((n) => n.state)).toEqual([
      "overloaded",
      "overloaded",
      "overloaded",
      "overloaded",
    ]);
    expect(frames[0].events).toEqual([
      "app overloaded at 4k RPS — shedding load",
    ]);
    expect(frames[1].events).toEqual([]);
    expect(frames.map((f) => f.errorRate)).toEqual([0, 0, 0.2, 0.2]);
    expect(frames.map((f) => f.servedRps)).toEqual([5000, 5000, 4000, 4000]);
    expect(frames.map((f) => f.perEdge["e-c-app"].rps)).toEqual([
      5000, 5000, 5000, 5000,
    ]);
  });
});

describe("simulate — golden 3 at frame level", () => {
  it("kill half the replicas at tick 5: util doubles, saturation logged", () => {
    const g = graph(
      [node("c", "client"), node("app", "app_server", { replicas: 2 })],
      [edge("c", "app")],
    );
    const kill: ApplyRulesFn = (t, s) => ({
      offeredRps: s.baseRps,
      aliveFraction: { app: t >= 5 ? 0.5 : 1 },
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 0.7, baseRps: 4000, readRatio: 0.75 }),
      kill,
    );
    const app = frames.map((f) => f.perNode["app"]);
    expect(app.map((n) => n.util)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 1, 1]);
    expect(app[4].state).toBe("ok");
    expect(app[5].state).toBe("saturated");
    expect(frames[5].events).toEqual(["app saturated at 4k RPS"]);
  });
});

describe("simulate — golden 4: spike drain", () => {
  it("queue fills during a ×3 spike, drains after, latency recovers", () => {
    const g = graph([node("c", "client"), node("app")], [edge("c", "app")]);
    const spike: ApplyRulesFn = (t, s) => ({
      offeredRps: t >= 5 && t < 10 ? s.baseRps * 3 : s.baseRps,
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 2, baseRps: 2000 }),
      spike,
    );
    expect(frames).toHaveLength(20);
    const app = frames.map((f) => f.perNode["app"]);
    expect(app.map((n) => n.queued)).toEqual([
      0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ]);
    expect(app.map((n) => n.dropped)).toEqual([
      0, 0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(app.map((n) => n.util)).toEqual([
      0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 2, 2, 2, 2, 1, 0.5, 0.5, 0.5, 0.5, 0.5,
      0.5, 0.5, 0.5, 0.5,
    ]);
    expect(frames[5].events).toEqual([
      "app overloaded at 4k RPS — shedding load",
    ]);
    expect(frames[10].events).toEqual(["app saturated at 4k RPS"]);
    expect(frames[11].events).toEqual(["app recovered"]);
    // latency mirrors the engine's formula: client 1ms + app M/M/1 + wait
    expect(frames[0].p95Ms).toBe(1.6 * (1 + 8 / (1 - 0.5)));
    expect(frames[6].p95Ms).toBe(1.6 * (1 + (8 / (1 - 0.95) + 500)));
    expect(frames[10].p95Ms).toBe(1.6 * (1 + 8 / (1 - 0.95)));
    expect(frames[11].p95Ms).toBe(frames[0].p95Ms);
    expect(frames.map((f) => f.errorRate)).toEqual([
      0, 0, 0, 0, 0, 0, 2000 / 6000, 2000 / 6000, 2000 / 6000, 2000 / 6000,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(frames.map((f) => f.servedRps)).toEqual([
      2000, 2000, 2000, 2000, 2000, 6000, 4000, 4000, 4000, 4000, 2000, 2000,
      2000, 2000, 2000, 2000, 2000, 2000, 2000, 2000,
    ]);
  });
});

describe("simulate — latency path", () => {
  it("weights downstream latency by forwarded traffic (cache absorbs hits)", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const frames = simulate(
      g,
      scenario({ durationSec: 0.1, baseRps: 10000, readRatio: 0.8 }),
    );
    expect(frames).toHaveLength(1);
    const cacheMs = 1 / (1 - 0.08); // util = max(8000, 2000)/100k = 0.08
    const dbMs = 5 / (1 - 2000 / 15000); // write-bound: 2000 vs 15k ceiling
    expect(frames[0].p95Ms).toBe(1.6 * (1 + (cacheMs + (3600 / 10000) * dbMs)));
    expect(frames[0].perEdge["e-cache-db"].rps).toBe(3600);
  });

  it("keeps async subtrees off the client latency path", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app"),
        node("q", "queue"),
        node("w", "worker"),
      ],
      [edge("c", "app"), edge("app", "q", { kind: "async" }), edge("q", "w")],
    );
    const frames = simulate(
      g,
      scenario({ durationSec: 0.1, baseRps: 2000, readRatio: 0 }),
    );
    // the 1k-cap worker is overloaded, but only the sync path counts
    expect(frames[0].perNode["w"].state).toBe("overloaded");
    expect(frames[0].errorRate).toBe(500 / 2000);
    expect(frames[0].p95Ms).toBe(1.6 * (1 + 8 / (1 - 0.5)));
  });

  it("stays total on a graph without an entry node", () => {
    const g = graph([node("a")], [], "missing");
    const frames = simulate(g, scenario({ durationSec: 0.2 }));
    expect(frames).toHaveLength(2);
    expect(frames[0].perNode["a"]).toEqual({
      util: 0,
      queued: 0,
      dropped: 0,
      state: "ok",
    });
    expect(frames[0].p95Ms).toBe(0);
    expect(frames[0].servedRps).toBe(0);
    expect(frames[0].errorRate).toBe(0);
  });
});

describe("simulate — golden 5: determinism", () => {
  it("same seed twice → byte-identical frame arrays", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const jitter: ApplyRulesFn = (_t, s, rng) => ({
      offeredRps: s.baseRps * rng(),
    });
    const sc = scenario({
      durationSec: 1.5,
      baseRps: 20000,
      readRatio: 0.8,
      seed: 7,
    });
    const a = simulate(g, sc, jitter);
    const b = simulate(g, sc, jitter);
    expect(a).toHaveLength(15);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = simulate(g, { ...sc, seed: 8 }, jitter);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });
});
