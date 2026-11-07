import { describe, expect, it } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
} from "../src/lib/core";
import {
  clientShares,
  edgeMultiplier,
  flowRps,
  propagateTraffic,
  scaleFlow,
  simulate,
  splitFlow,
  topoSort,
  zeroFlow,
  type ApplyRulesFn,
} from "../src/lib/simulation/engine";
import { DEFAULT_BREAKER } from "../src/lib/simulation/breaker";
import { compileRules } from "../src/lib/simulation/rules";

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
  overrides: Partial<
    Pick<
      DesignEdge,
      | "trafficShare"
      | "callsPerRequest"
      | "kind"
      | "timeoutMs"
      | "retries"
      | "breaker"
    >
  > = {},
): DesignEdge {
  return { id: `e-${source}-${target}`, source, target, kind: "sync", ...overrides };
}

function graph(
  nodes: DesignNode[],
  edges: DesignEdge[],
  entryNodeId = "c",
): DesignGraph {
  return { nodes, edges, entryNodeId };
}

/** p95 ≈ mean + 2σ, mirroring the engine's estimate (T-8.7). */
const p95 = (meanMs: number, varianceMs2: number) =>
  meanMs + 2 * Math.sqrt(varianceMs2);

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

  it("call edges fan out: every call carries its own multiple", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("cache", "cache"), node("q", "queue")],
      [
        edge("c", "app"),
        edge("app", "cache", { callsPerRequest: 1 }),
        edge("app", "q", { kind: "async", callsPerRequest: 0.2 }),
      ],
    );
    const { perNode, perEdge } = propagateTraffic(g, { read: 1000, write: 0 });
    expect(perEdge["e-app-cache"]).toEqual({ read: 1000, write: 0 });
    expect(perEdge["e-app-q"]).toEqual({ read: 200, write: 0 });
    expect(perNode["q"].asyncArrivals).toEqual({ read: 200, write: 0 });
  });

  it("callsPerRequest > 1 multiplies", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "db", { callsPerRequest: 3 })],
    );
    const { perNode } = propagateTraffic(g, { read: 1000, write: 500 });
    expect(perNode["db"].demand).toEqual({ read: 3000, write: 1500 });
  });

  it("the engine ignores trafficShare on call edges (migration is the import's job)", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "db", { trafficShare: 0.5 })],
    );
    const { perNode } = propagateTraffic(g, { read: 1000, write: 500 });
    expect(perNode["db"].demand).toEqual({ read: 1000, write: 500 });
  });

  it("edgeMultiplier: split share on lb edges, calls per request elsewhere, absent = 1", () => {
    expect(edgeMultiplier(edge("lb", "a", { trafficShare: 0.25 }), "lb")).toBe(0.25);
    expect(edgeMultiplier(edge("lb", "a"), "lb")).toBe(1);
    expect(
      edgeMultiplier(edge("app", "q", { callsPerRequest: 0.2, trafficShare: 0.9 }), "app_server"),
    ).toBe(0.2);
    expect(edgeMultiplier(edge("app", "q"), "app_server")).toBe(1);
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
    expect(frames.map((f) => f.asyncDroppedRps)).toEqual([0, 0, 0, 0]);
    expect(frames.map((f) => f.maxLagSec)).toEqual([0, 0, 0, 0]);
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
    // latency mirrors the engine's formula: client 1ms + app M/M/1 + wait;
    // only the M/M/1 part is random (variance = its mean²), the wait is a shift
    const sat = 8 / (1 - 0.95); // 160
    expect(frames[0].p95Ms).toBeCloseTo(p95(1 + 16, 1 + 16 * 16), 9); // 49.06
    expect(frames[6].p95Ms).toBeCloseTo(p95(1 + (sat + 500), 1 + sat * sat), 9); // 981.01
    expect(frames[10].p95Ms).toBeCloseTo(p95(1 + sat, 1 + sat * sat), 9); // 481.01
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
  it("a cache's DB call charges only misses + writes (3600/10000), not callsPerRequest; the miss share widens the tail", () => {
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
    const w = 3600 / 10000;
    expect(frames[0].p95Ms).toBeCloseTo(
      p95(
        1 + cacheMs + w * dbMs,
        1 + cacheMs * cacheMs + w * dbMs * dbMs + w * (1 - w) * dbMs * dbMs,
      ),
      9,
    ); // 13.51
    expect(frames[0].perEdge["e-cache-db"].rps).toBe(3600);
  });

  it("golden: an app calling a cache and then a DB sequentially pays both", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("cache", "cache"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "cache"), edge("app", "db")],
    );
    const [f] = simulate(g, scenario({ durationSec: 0.1, readRatio: 1 }));
    const appMs = 8 / (1 - 0.5); // 2000 / 4000
    const cacheMs = 1 / (1 - 2000 / 100000);
    const dbMs = 5 / (1 - 2000 / 30000);
    expect(f.p95Ms).toBeCloseTo(
      p95(1 + appMs + cacheMs + dbMs, 1 + appMs * appMs + cacheMs * cacheMs + dbMs * dbMs),
      9,
    ); // 57.24
    // the pre-M8 average (0.5/0.5 shares) would have paid half of each
    // (two half-weight calls: 0.5·m² + 0.25·m² spread each)
    expect(f.p95Ms).toBeGreaterThan(
      p95(
        1 + appMs + 0.5 * cacheMs + 0.5 * dbMs,
        1 + appMs * appMs + 0.75 * cacheMs * cacheMs + 0.75 * dbMs * dbMs,
      ),
    );
  });

  it("a fractional call pays its fraction (cache-aside: 20% of requests hit the DB)", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("cache", "cache"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "cache"), edge("app", "db", { callsPerRequest: 0.2 })],
    );
    const [f] = simulate(g, scenario({ durationSec: 0.1, readRatio: 1 }));
    const appMs = 8 / (1 - 0.5);
    const cacheMs = 1 / (1 - 2000 / 100000);
    const dbMs = 5 / (1 - 400 / 30000);
    expect(f.perEdge["e-app-db"].rps).toBe(400);
    expect(f.p95Ms).toBeCloseTo(
      p95(
        1 + appMs + cacheMs + 0.2 * dbMs,
        1 + appMs * appMs + cacheMs * cacheMs + 0.2 * dbMs * dbMs + 0.2 * 0.8 * dbMs * dbMs,
      ),
      9,
    ); // 51.73
  });

  it("an LB split averages its backends", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("a"), node("b")],
      [edge("c", "lb"), edge("lb", "a", { trafficShare: 0.5 }), edge("lb", "b", { trafficShare: 0.5 })],
    );
    const [f] = simulate(g, scenario({ durationSec: 0.1, readRatio: 1 }));
    const lbMs = 1 / (1 - 2000 / 100000);
    const backendMs = 8 / (1 - 1000 / 4000);
    // identical backends: the mixture adds no spread
    expect(f.p95Ms).toBeCloseTo(
      p95(1 + lbMs + backendMs, 1 + lbMs * lbMs + backendMs * backendMs),
      9,
    ); // 34.21
  });

  it("an LB with a partitioned backend charges the live backend in full", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("a"), node("b")],
      [edge("c", "lb"), edge("lb", "a", { trafficShare: 0.5 }), edge("lb", "b", { trafficShare: 0.5 })],
    );
    const cut: ApplyRulesFn = (_t, s) => ({ offeredRps: s.baseRps, deadEdges: ["e-lb-b"] });
    const [f] = simulate(g, scenario({ durationSec: 0.1, readRatio: 1 }), cut);
    const lbMs = 1 / (1 - 2000 / 100000);
    const backendMs = 8 / (1 - 1000 / 4000);
    expect(f.perEdge["e-lb-b"].rps).toBe(0);
    expect(f.p95Ms).toBeCloseTo(
      p95(1 + lbMs + backendMs, 1 + lbMs * lbMs + backendMs * backendMs),
      9,
    ); // 34.21; pre-T-8.7: 20.299; pre-T-8.4: 11.766
  });

  it("a dead (partitioned) call adds no latency", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("db", "db_sql")],
      [edge("c", "app"), edge("app", "db")],
    );
    const cut: ApplyRulesFn = (_t, s) => ({ offeredRps: s.baseRps, deadEdges: ["e-app-db"] });
    const [f] = simulate(g, scenario({ durationSec: 0.1, readRatio: 1 }), cut);
    expect(f.perEdge["e-app-db"].rps).toBe(0);
    expect(f.p95Ms).toBeCloseTo(p95(1 + 16, 1 + 16 * 16), 9); // 49.06
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
    // the queue hands the 1k-cap worker only what it can take; the rest waits
    expect(frames[0].perNode["w"].state).toBe("saturated");
    expect(frames[0].perNode["q"]).toMatchObject({
      queued: 1000,
      dropped: 0,
      queueDepth: 100,
      lagSec: 0.1,
    });
    expect(frames[0].errorRate).toBe(0);
    expect(frames[0].p95Ms).toBeCloseTo(p95(1 + 16, 1 + 16 * 16), 9);
  });

  it("stops the client path at a queue: consumers behind it add no latency", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app"),
        node("q", "queue"),
        node("w", "worker", { replicas: 1 }),
      ],
      [edge("c", "app"), edge("app", "q"), edge("q", "w")],
    );
    const frames = simulate(
      g,
      scenario({ durationSec: 1, baseRps: 1500, readRatio: 1 }),
    );
    expect(frames).toHaveLength(10);
    const appMs = 8 / (1 - 1500 / 4000);
    const queueMs = 4 / (1 - 1500 / 800000); // enqueue cost only
    for (const f of frames) {
      expect(f.perNode["w"].state).toBe("saturated");
      expect(f.p95Ms).toBeCloseTo(
        p95(1 + appMs + queueMs, 1 + appMs * appMs + queueMs * queueMs),
        9,
      );
    }
  });

  it("an LB split is a mixture: branch spread adds to the tail, not the mean", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("a1", "app_server", { replicas: 1 }), node("a2", "app_server", { replicas: 3 })],
      [edge("c", "lb"), edge("lb", "a1", { trafficShare: 0.5 }), edge("lb", "a2", { trafficShare: 0.5 })],
    );
    const frames = simulate(g, scenario({ durationSec: 0.1, baseRps: 4000, readRatio: 0 }));
    const lbMs = 1 / (1 - 0.04); // 4000 / 100k
    const a1 = 8 / (1 - 0.5); // 2000 / 4000 → 16
    const a2 = 8 / (1 - 2000 / 12000); // → 9.6
    const mixMean = 0.5 * a1 + 0.5 * a2;
    const mixVar = 0.5 * (2 * a1 * a1) + 0.5 * (2 * a2 * a2) - mixMean * mixMean;
    expect(frames[0].p95Ms).toBeCloseTo(p95(1 + lbMs + mixMean, 1 + lbMs * lbMs + mixVar), 9); // 42.15
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

describe("simulate — golden 6: queues buffer (T-8.1)", () => {
  const g = graph(
    [
      node("c", "client"),
      node("app", "app_server", { replicas: 5 }),
      node("q", "queue"),
      node("w", "worker", { replicas: 2 }),
    ],
    [edge("c", "app"), edge("app", "q", { kind: "async" }), edge("q", "w")],
  );
  const sc = scenario({
    durationSec: 30,
    baseRps: 1500,
    timeline: [{ at: 5, rule: "spike", factor: 3, forSec: 3 }],
  });
  const frames = simulate(g, sc, compileRules(g, sc));
  const q = frames.map((f) => f.perNode["q"]);
  const w = frames.map((f) => f.perNode["w"]);

  it("a ×3 spike into a queue costs zero errors anywhere", () => {
    expect(frames).toHaveLength(300);
    expect(frames.every((f) => f.errorRate === 0)).toBe(true);
    expect(
      frames.every((f) => Object.values(f.perNode).every((n) => n.dropped === 0)),
    ).toBe(true);
  });

  it("workers run saturated, never overloaded, while the backlog drains", () => {
    expect(Math.max(...w.map((n) => n.util))).toBe(1);
    expect(w[49].state).toBe("hot");
    expect(w[50].state).toBe("saturated");
    expect(w[229].state).toBe("saturated");
    expect(w[230].state).toBe("hot");
    expect(frames[50].events).toEqual(["w saturated at 2k RPS"]);
    expect(frames[230].events).toEqual(["w running hot"]);
  });

  it("backlog grows through the spike, then drains to 0", () => {
    const depth = q.map((n) => n.queueDepth);
    expect(depth[49]).toBe(0);
    expect(depth[50]).toBe(250);
    expect(depth[79]).toBe(7500);
    expect(Math.max(...depth.map((d) => d ?? 0))).toBe(7500);
    expect(depth[80]).toBe(7450);
    expect(depth[228]).toBe(50);
    expect(depth[229]).toBe(0);
    expect(depth.slice(229).every((d) => d === 0)).toBe(true);
  });

  it("consumer lag peaks at the end of the spike and returns to 0", () => {
    const lag = q.map((n) => n.lagSec);
    expect(lag[50]).toBe(0.125);
    expect(lag[79]).toBe(3.75);
    expect(Math.max(...lag.map((l) => l ?? 0))).toBe(3.75);
    expect(lag[229]).toBe(0);
    expect(lag[299]).toBe(0);
  });

  it("queueDepth/lagSec appear on async nodes only", () => {
    expect("queueDepth" in frames[0].perNode["app"]).toBe(false);
    expect("lagSec" in frames[0].perNode["w"]).toBe(false);
    expect(frames[0].perNode["q"]).toMatchObject({ queueDepth: 0, lagSec: 0 });
  });
});

describe("simulate — queue with no one pulling", () => {
  const g = graph(
    [node("c", "client"), node("q", "queue"), node("w", "worker")],
    [edge("c", "q", { kind: "async" }), edge("q", "w")],
  );

  it("a down consumer pauses the drain: backlog holds and ages", () => {
    const rules: ApplyRulesFn = (t, s) => ({
      offeredRps: s.baseRps,
      aliveFraction: t >= 2 ? { w: 0 } : ({} as Record<string, number>),
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 0.5, baseRps: 500 }),
      rules,
    );
    const q = frames.map((f) => f.perNode["q"]);
    expect(q.map((n) => n.queueDepth)).toEqual([0, 0, 50, 100, 150]);
    expect(q[2].lagSec).toBeCloseTo(0.1, 12);
    expect(q[4].lagSec).toBeCloseTo(0.3, 12);
    expect(frames.map((f) => f.errorRate)).toEqual([0, 0, 0, 0, 0]);
    expect(frames[2].perNode["w"].state).toBe("down");
  });

  it("a cut consumer edge holds the backlog instead of dropping it", () => {
    const rules: ApplyRulesFn = (t, s) => ({
      offeredRps: s.baseRps,
      deadEdges: t === 1 ? ["e-q-w"] : [],
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 0.3, baseRps: 500 }),
      rules,
    );
    expect(frames.map((f) => f.perNode["q"].queueDepth)).toEqual([0, 50, 0]);
    expect(frames.map((f) => f.perEdge["e-q-w"].rps)).toEqual([500, 0, 1000]);
    expect(frames.map((f) => f.errorRate)).toEqual([0, 0, 0]);
  });
});

describe("simulate — T-8.2 client vs async drops", () => {
  it("(a) drops at a worker behind an async edge are async, not client errors", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("w", "worker")],
      [edge("c", "a"), edge("a", "w", { kind: "async" })],
    );
    const frames = simulate(
      g,
      scenario({ durationSec: 0.4, baseRps: 2000, readRatio: 1 }),
    );
    expect(frames.map((f) => f.errorRate)).toEqual([0, 0, 0, 0]);
    expect(frames.map((f) => f.servedRps)).toEqual([2000, 2000, 2000, 2000]);
    expect(frames.map((f) => f.asyncDroppedRps)).toEqual([
      500, 1000, 1000, 1000,
    ]);
    expect(frames.map((f) => f.perNode["w"].dropped)).toEqual([
      500, 1000, 1000, 1000,
    ]);
  });

  // a fans out sync to s and async to w; w also calls s — s is half client
  const shared = graph(
    [
      node("c", "client"),
      node("a", "app_server", { replicas: 3 }),
      node("s"),
      node("w", "worker", { replicas: 10 }),
    ],
    [
      edge("c", "a"),
      edge("a", "s"),
      edge("a", "w", { kind: "async" }),
      edge("w", "s"),
    ],
  );

  it("(b) a shared sink splits its drops by client share", () => {
    const frames = simulate(
      shared,
      scenario({ durationSec: 0.4, baseRps: 3000, readRatio: 1 }),
    );
    expect(frames.map((f) => f.perNode["s"].dropped)).toEqual([
      0, 2000, 2000, 2000,
    ]);
    expect(frames.map((f) => f.errorRate)).toEqual([
      0,
      1000 / 3000,
      1000 / 3000,
      1000 / 3000,
    ]);
    expect(frames.map((f) => f.asyncDroppedRps)).toEqual([0, 1000, 1000, 1000]);
    expect(frames.map((f) => f.servedRps)).toEqual([3000, 2000, 2000, 2000]);
  });

  it("(c) queue retention overflow is async: client errorRate stays 0", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app", "app_server", { replicas: 5 }),
        node("queue", "queue", { retentionMsgs: 1000 }),
        node("w", "worker", { replicas: 1 }),
      ],
      [
        edge("c", "app"),
        edge("app", "queue", { kind: "async" }),
        edge("queue", "w"),
      ],
    );
    // backlog grows 2000 msgs/s, so the 1000-msg retention overflows by ~0.5s
    const frames = simulate(g, scenario({ durationSec: 2, baseRps: 3000 }));
    expect(frames.every((f) => f.errorRate === 0)).toBe(true);
    expect(frames.some((f) => f.perNode["queue"].dropped > 0)).toBe(true);
    expect(
      frames.reduce((sum, f) => sum + f.asyncDroppedRps, 0),
    ).toBeGreaterThan(0);
  });

  it("(d) frame maxLagSec is the per-node max lagSec", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app", "app_server", { replicas: 5 }),
        node("q", "queue"),
        node("w", "worker", { replicas: 2 }),
      ],
      [edge("c", "app"), edge("app", "q", { kind: "async" }), edge("q", "w")],
    );
    const sc = scenario({
      durationSec: 30,
      baseRps: 1500,
      timeline: [{ at: 5, rule: "spike", factor: 3, forSec: 3 }],
    });
    const frames = simulate(g, sc, compileRules(g, sc));
    for (const f of frames) {
      expect(f.maxLagSec).toBe(
        Math.max(0, ...Object.values(f.perNode).map((n) => n.lagSec ?? 0)),
      );
    }
    expect(Math.max(...frames.map((f) => f.maxLagSec))).toBeGreaterThan(1);
    expect(frames[frames.length - 1].maxLagSec).toBe(0);
    expect(frames.every((f) => f.errorRate === 0)).toBe(true);
  });

  it("clientShares: entry 1, async-fed 0, mixed sink by sync in-flow", () => {
    const prop = propagateTraffic(shared, splitFlow(3000, 1));
    const shares = clientShares(shared, prop, new Map());
    expect(Object.fromEntries(shares)).toEqual({ c: 1, a: 1, w: 0, s: 0.5 });
  });

  it("clientShares: a node with zero inflow keeps its previous share", () => {
    const prop = propagateTraffic(shared, splitFlow(0, 1));
    const shares = clientShares(shared, prop, new Map([["s", 0.25]]));
    expect(shares.get("s")).toBe(0.25);
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

describe("simulate — timeouts and retries (T-8.5)", () => {
  it("a drop is retried next tick; only the last attempt's failure is an error", () => {
    const sc = scenario({ durationSec: 0.3, baseRps: 8000, readRatio: 1 });
    const g = graph(
      [node("c", "client"), node("dep")],
      [edge("c", "dep", { retries: 1 })],
    );
    const frames = simulate(g, sc);
    const e = frames.map((f) => f.perEdge["e-c-dep"]);
    expect(e.map((x) => x.rps)).toEqual([8000, 10000, 12800]);
    expect(e.map((x) => x.retryRps)).toEqual([0, 2000, 4800]);
    expect(e.map((x) => x.failRate)).toEqual([0.25, 0.6, 0.6875]);
    const dep = frames.map((f) => f.perNode["dep"]);
    expect(dep.map((n) => n.dropped)).toEqual([2000, 6000, 8800]);
    expect(dep.map((n) => n.util)).toEqual([2, 3, 3.7]);
    expect(frames.map((f) => f.errorRate)).toEqual([0, 0.15, 0.4125]);
    expect(frames.map((f) => f.servedRps)).toEqual([8000, 6800, 4700]);

    const noRetries = graph(
      [node("c", "client"), node("dep")],
      [edge("c", "dep")],
    );
    expect(simulate(noRetries, sc).map((f) => f.errorRate)).toEqual([
      0.25, 0.5, 0.5,
    ]);
  });

  it("a timeout fails the slow tail and caps the caller's wait", () => {
    const g = graph(
      [node("c", "client"), node("dep")],
      [edge("c", "dep", { timeoutMs: 100 })],
    );
    const [frame] = simulate(g, scenario({ durationSec: 0.1, baseRps: 2000 }));
    expect(frame.errorRate).toBeCloseTo(Math.exp(-100 / 16), 12);
    const capped = 16 * (1 - Math.exp(-100 / 16)); // E[min(T, 100)]
    // a cap scales the target's spread with its mean: v' = v × (m'/m)²
    expect(frame.p95Ms).toBeCloseTo(p95(1 + capped, 1 + 256 * (capped / 16) ** 2), 9);
    expect(frame.perEdge["e-c-dep"]).toEqual({
      rps: 2000,
      retryRps: 0,
      failRate: Math.exp(-100 / 16),
    });
  });

  it("edges without timeoutMs/retries carry no new frame fields", () => {
    const g = graph([node("c", "client"), node("app")], [edge("c", "app")]);
    const frames = simulate(g, scenario({ durationSec: 0.4, baseRps: 5000 }));
    expect(Object.keys(frames[0].perEdge["e-c-app"])).toEqual(["rps"]);
  });

  it("a partitioned retry edge books everything unroutable and resets", () => {
    const g = graph(
      [node("c", "client"), node("dep")],
      [edge("c", "dep", { retries: 2 })],
    );
    const cut: ApplyRulesFn = (t, s) => ({
      offeredRps: s.baseRps,
      ...(t === 1 ? { deadEdges: ["e-c-dep"] } : {}),
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 0.3, baseRps: 8000 }),
      cut,
    );
    expect(frames[1].errorRate).toBe(1);
    expect(frames[1].perEdge["e-c-dep"].failRate).toBe(1);
    expect(frames[2].perEdge["e-c-dep"].retryRps).toBe(0);
  });
});

const storm = (policy: Partial<Pick<DesignEdge, "timeoutMs" | "retries">>) =>
  graph(
    [
      node("c", "client"),
      node("app", "app_server", { replicas: 4 }),
      node("dep"),
    ],
    [edge("c", "app"), edge("app", "dep", { timeoutMs: 200, ...policy })],
  );

/** T-8.5's retry storm, shared with T-8.6's breaker golden. */
function retryStormFixture() {
  const spike: ApplyRulesFn = (t, s) => ({
    offeredRps: t >= 10 && t < 20 ? s.baseRps * 2 : s.baseRps,
  });
  return {
    graph: storm({ retries: 3 }),
    scenario: scenario({ durationSec: 6, baseRps: 3000, readRatio: 1 }),
    rules: (): ApplyRulesFn => spike,
    dependencyId: "dep",
    retryEdgeId: "e-app-dep",
    /** the spike ends at tick 20 */
    triggerEndSec: 2,
  };
}

describe("simulate — golden: retry storm (T-8.5)", () => {
  const { scenario: sc, rules } = retryStormFixture();
  const spike = rules();

  it("retries ×3 amplify a 1 s spike into a dependency that stays overloaded", () => {
    const { graph: g } = retryStormFixture();
    const frames = simulate(g, sc, spike);
    expect(frames).toHaveLength(60);
    for (const f of frames.slice(0, 10)) {
      expect(f.perNode["dep"].state).toBe("hot");
      expect(f.errorRate).toBeLessThan(0.01);
    }
    for (const f of frames.slice(30)) {
      expect(f.perNode["dep"].state).toBe("overloaded");
      expect(f.perEdge["e-app-dep"].rps).toBeGreaterThan(2 * 3000);
      expect(f.perEdge["e-app-dep"].retryRps).toBeGreaterThan(3000);
      expect(f.errorRate).toBeGreaterThan(0.5);
    }
  });

  it("without retries the dependency recovers after the spike", () => {
    const frames = simulate(storm({}), sc, spike);
    for (const f of frames.slice(25)) {
      expect(f.perNode["dep"].state).toBe("hot");
      expect(f.perEdge["e-app-dep"].rps).toBe(3000);
      expect(f.perEdge["e-app-dep"].retryRps).toBe(0);
      expect(f.errorRate).toBeLessThan(0.01);
    }
  });

  it("control: retries ×3 under steady load never overload", () => {
    const frames = simulate(storm({ retries: 3 }), sc);
    for (const f of frames) {
      expect(f.perNode["dep"].state).not.toBe("overloaded");
      expect(f.errorRate).toBeLessThan(0.01);
    }
  });
});

describe("propagateTraffic — breaker gate (T-8.6)", () => {
  const g = graph([node("c", "client"), node("app")], [edge("c", "app")]);
  const offered = { read: 1000, write: 0 };

  it("admits only edgePass of the flow; the rest is unroutable at the caller", () => {
    const prop = propagateTraffic(g, offered, undefined, {
      edgePass: { "e-c-app": 0.1 },
    });
    expect(prop.perEdge["e-c-app"]).toEqual({ read: 100, write: 0 });
    expect(prop.freshPerEdge["e-c-app"]).toEqual({ read: 100, write: 0 });
    expect(prop.unroutable.c).toEqual({ read: 900, write: 0 });
    expect(prop.perNode.app.demand).toEqual({ read: 100, write: 0 });
  });

  it("pass 0 sends nothing to the target", () => {
    const prop = propagateTraffic(g, offered, undefined, {
      edgePass: { "e-c-app": 0 },
    });
    expect(prop.perEdge["e-c-app"]).toEqual({ read: 0, write: 0 });
    expect(prop.unroutable.c).toEqual({ read: 1000, write: 0 });
  });
});

describe("simulate — golden: circuit breaker (T-8.6)", () => {
  it("opens under a dependency outage, fails fast, probes, re-opens, then closes", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("dep")],
      [edge("c", "app"), edge("app", "dep", { breaker: DEFAULT_BREAKER })],
    );
    const outage: ApplyRulesFn = (t, s) => ({
      offeredRps: s.baseRps,
      ...(t >= 10 && t < 80 ? { aliveFraction: { dep: 0 } } : {}),
    });
    const frames = simulate(
      g,
      scenario({ durationSec: 13, baseRps: 1000, readRatio: 1 }),
      outage,
    );
    const lines = frames.flatMap((f, i) =>
      f.events.filter((e) => e.includes("breaker")).map((e) => [i, e]),
    );
    expect(lines).toEqual([
      [14, "app → dep breaker open at 100% errors — failing fast"],
      [65, "app → dep breaker half-open — probing"],
      [65, "app → dep breaker open at 100% errors — failing fast"],
      [116, "app → dep breaker half-open — probing"],
      [116, "app → dep breaker closed — traffic restored"],
    ]);
    const phase = (i: number) => frames[i].perEdge["e-app-dep"].breaker;
    const rps = (i: number) => frames[i].perEdge["e-app-dep"].rps;
    const expectPhase = (from: number, to: number, p: string) => {
      for (let i = from; i <= to; i++) expect(phase(i)).toBe(p);
    };
    expectPhase(0, 14, "closed");
    expectPhase(15, 64, "open");
    expectPhase(65, 65, "half-open");
    expectPhase(66, 115, "open");
    expectPhase(116, 116, "half-open");
    expectPhase(117, 129, "closed");
    expect(rps(13)).toBe(1000);
    for (let i = 15; i <= 64; i++) expect(rps(i)).toBe(0);
    expect(rps(65)).toBe(100);
    expect(rps(66)).toBe(0);
    expect(rps(116)).toBe(100);
    expect(rps(117)).toBe(1000);
    expect(frames[40].perNode.app.dropped).toBe(1000);
    expect(frames[40].errorRate).toBe(1);
    expect(frames[116].errorRate).toBe(0.9);
    for (const f of frames.slice(117)) expect(f.errorRate).toBe(0);
  });

  it("async edges ignore the breaker", () => {
    const withBreaker = graph(
      [node("c", "client"), node("app"), node("q", "queue")],
      [
        edge("c", "app"),
        edge("app", "q", { kind: "async", breaker: DEFAULT_BREAKER }),
      ],
    );
    const plain = graph(withBreaker.nodes, [
      edge("c", "app"),
      edge("app", "q", { kind: "async" }),
    ]);
    const sc = scenario({ durationSec: 0.1 });
    const [frame] = simulate(withBreaker, sc);
    expect("breaker" in frame.perEdge["e-app-q"]).toBe(false);
    expect(frame.perEdge["e-app-q"].rps).toBe(
      simulate(plain, sc)[0].perEdge["e-app-q"].rps,
    );
  });

  it("golden: the T-8.5 retry storm recovers with the breaker on", () => {
    const {
      graph: g,
      scenario: s,
      rules,
      dependencyId,
      retryEdgeId,
      triggerEndSec,
    } = retryStormFixture();
    const run = {
      ...s,
      durationSec: Math.max(s.durationSec, triggerEndSec + 10),
    };
    const guarded = {
      ...g,
      edges: g.edges.map((e) =>
        e.id === retryEdgeId ? { ...e, breaker: DEFAULT_BREAKER } : e,
      ),
    };
    const off = simulate(g, run, rules());
    const on = simulate(guarded, run, rules());
    expect(off.at(-1)!.perNode[dependencyId].state).toBe("overloaded"); // storm persists without it
    const lines = on.flatMap((f) =>
      f.events.filter((e) => e.includes("breaker")),
    );
    expect(lines[0]).toMatch(/breaker open at \d+% errors/);
    expect(lines.at(-1)).toMatch(/breaker closed — traffic restored$/);
    expect(
      on.some(
        (f) =>
          f.perEdge[retryEdgeId].breaker === "open" &&
          f.perEdge[retryEdgeId].rps === 0,
      ),
    ).toBe(true);
    for (const f of on.slice(-10)) {
      expect(f.errorRate).toBeLessThan(0.01); // T-8.5's 200 ms timeout leaves a tiny exponential tail
      expect(["ok", "hot"]).toContain(f.perNode[dependencyId].state);
      expect(f.perEdge[retryEdgeId].breaker).toBe("closed");
    }
  });
});
