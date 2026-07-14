import { describe, expect, it } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
} from "../src/lib/core";
import { simulate } from "../src/lib/simulation/engine";
import { mulberry32 } from "../src/lib/simulation/rng";
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

/** offeredRps per tick 0..ticks-1, threading one rng like simulate does */
function offeredSeries(g: DesignGraph, sc: Scenario, ticks: number): number[] {
  const apply = compileRules(g, sc);
  const rng = mulberry32(sc.seed);
  return Array.from({ length: ticks }, (_, t) => apply(t, sc, rng).offeredRps);
}

describe("ramp", () => {
  it("interpolates offered RPS linearly to toRps, then holds", () => {
    const g = graph([node("c", "client")], []);
    const sc = scenario({
      timeline: [{ at: 0.5, rule: "ramp", toRps: 4000, overSec: 1 }],
    });
    const offered = offeredSeries(g, sc, 20);
    expect(offered[4]).toBe(2000);
    expect(offered[5]).toBe(2000); // ramp starts here at progress 0
    expect(offered[10]).toBe(2000 + (4000 - 2000) * (5 / 10));
    expect(offered[15]).toBe(4000);
    expect(offered[19]).toBe(4000);
  });

  it("jumps immediately when overSec is 0", () => {
    const g = graph([node("c", "client")], []);
    const sc = scenario({
      timeline: [{ at: 0.5, rule: "ramp", toRps: 5000, overSec: 0 }],
    });
    const offered = offeredSeries(g, sc, 7);
    expect(offered[4]).toBe(2000);
    expect(offered[5]).toBe(5000);
  });
});

describe("spike", () => {
  it("multiplies offered RPS inside the half-open window [at, at+forSec)", () => {
    const g = graph([node("c", "client")], []);
    const sc = scenario({
      timeline: [{ at: 0.5, rule: "spike", factor: 3, forSec: 0.5 }],
    });
    const offered = offeredSeries(g, sc, 12);
    expect(offered[4]).toBe(2000);
    expect(offered[5]).toBe(6000);
    expect(offered[9]).toBe(6000);
    expect(offered[10]).toBe(2000);
  });

  it("multiplies the ramped baseline, not the scenario base", () => {
    const g = graph([node("c", "client")], []);
    const sc = scenario({
      baseRps: 1000,
      timeline: [
        { at: 0, rule: "ramp", toRps: 2000, overSec: 1 },
        { at: 0.5, rule: "spike", factor: 2, forSec: 0.5 },
      ],
    });
    const offered = offeredSeries(g, sc, 10);
    expect(offered[7]).toBe((1000 + (2000 - 1000) * (7 / 10)) * 2);
  });

  it("golden 4 through the real rule: spike ×3, queue drains after", () => {
    const g = graph([node("c", "client"), node("app")], [edge("c", "app")]);
    const sc = scenario({
      durationSec: 2,
      timeline: [{ at: 0.5, rule: "spike", factor: 3, forSec: 0.5 }],
    });
    const frames = simulate(g, sc, compileRules(g, sc));
    const app = frames.map((f) => f.perNode["app"]);
    expect(app.map((n) => n.queued)).toEqual([
      0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0,
    ]);
    expect(app.map((n) => n.dropped)).toEqual([
      0, 0, 0, 0, 0, 0, 2000, 2000, 2000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(frames[11].events).toEqual(["app recovered"]);
  });
});

describe("kill", () => {
  it("golden 3 through the real rule: kill 1 of 2 replicas at t=0.5s", () => {
    const g = graph(
      [node("c", "client"), node("app", "app_server", { replicas: 2 })],
      [edge("c", "app")],
    );
    const sc = scenario({
      durationSec: 0.7,
      baseRps: 4000,
      readRatio: 0.75,
      timeline: [{ at: 0.5, rule: "kill", target: "app_server", count: 1 }],
    });
    const frames = simulate(g, sc, compileRules(g, sc));
    const app = frames.map((f) => f.perNode["app"]);
    expect(app.map((n) => n.util)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 1, 1]);
    expect(frames[5].events).toEqual(["app saturated at 4k RPS"]);
  });

  it("matches a node id before a kind and stays dead to the end", () => {
    const g = graph(
      [node("c", "client"), node("a1"), node("a2")],
      [
        edge("c", "a1", { trafficShare: 0.5 }),
        edge("c", "a2", { trafficShare: 0.5 }),
      ],
    );
    const sc = scenario({
      timeline: [{ at: 0, rule: "kill", target: "a2" }],
    });
    const apply = compileRules(g, sc);
    const rng = mulberry32(sc.seed);
    expect(apply(0, sc, rng).aliveFraction).toEqual({ a2: 0 });
    expect(apply(9, sc, rng).aliveFraction).toEqual({ a2: 0 });
  });

  it("kills everything when count exceeds the instance pool", () => {
    const g = graph(
      [node("c", "client"), node("a1"), node("a2")],
      [
        edge("c", "a1", { trafficShare: 0.5 }),
        edge("c", "a2", { trafficShare: 0.5 }),
      ],
    );
    const sc = scenario({
      timeline: [{ at: 0, rule: "kill", target: "app_server", count: 5 }],
    });
    const apply = compileRules(g, sc);
    expect(apply(0, sc, mulberry32(sc.seed)).aliveFraction).toEqual({
      a1: 0,
      a2: 0,
    });
  });

  it("samples victims with the seeded RNG — same seed, same victims", () => {
    const g = graph(
      [node("c", "client"), node("a1"), node("a2")],
      [
        edge("c", "a1", { trafficShare: 0.5 }),
        edge("c", "a2", { trafficShare: 0.5 }),
      ],
    );
    const sc = scenario({
      seed: 7,
      timeline: [{ at: 0, rule: "kill", target: "app_server", count: 1 }],
    });
    const pick = () =>
      compileRules(g, sc)(0, sc, mulberry32(sc.seed)).aliveFraction;
    const first = pick();
    expect(first).toEqual(pick());
    expect(Object.values(first ?? {})).toEqual([0]); // exactly one node died
  });
});

describe("flush", () => {
  it("zeroes cache hit rate at `at` and recovers 1.5%/tick toward config", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const sc = scenario({
      timeline: [{ at: 0, rule: "flush", target: "cache" }],
    });
    const apply = compileRules(g, sc);
    const rng = mulberry32(sc.seed);
    expect(apply(0, sc, rng).hitRate).toEqual({ cache: 0 });
    expect(apply(10, sc, rng).hitRate).toEqual({ cache: 0.015 * 10 });
    expect(apply(53, sc, rng).hitRate).toEqual({ cache: 0.015 * 53 });
    expect(apply(54, sc, rng).hitRate).toBeUndefined(); // 0.81 ≥ 0.8: config resumes
  });

  it("floods the backend at frame level", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const sc = scenario({
      durationSec: 0.1,
      baseRps: 10000,
      readRatio: 0.8,
      timeline: [{ at: 0, rule: "flush", target: "cache" }],
    });
    const frames = simulate(g, sc, compileRules(g, sc));
    // hit rate 0: all 8000 reads miss, plus 2000 writes
    expect(frames[0].perEdge["e-cache-db"].rps).toBe(10000);
  });
});

describe("partition", () => {
  it("cuts every edge touching the target and books the flow as drops", () => {
    const g = graph(
      [
        node("c", "client"),
        node("cache", "cache", { hitRate: 0.8 }),
        node("db", "db_sql"),
      ],
      [edge("c", "cache"), edge("cache", "db")],
    );
    const sc = scenario({
      durationSec: 0.5,
      baseRps: 10000,
      readRatio: 0.8,
      timeline: [{ at: 0, rule: "partition", target: "db_sql", forSec: 0.3 }],
    });
    const frames = simulate(g, sc, compileRules(g, sc));
    // partitioned: misses + writes (1600 + 2000) strand at the cache
    expect(frames[0].perEdge["e-cache-db"].rps).toBe(0);
    expect(frames[0].perNode["cache"].dropped).toBe(3600);
    expect(frames[0].perNode["db"].util).toBe(0);
    expect(frames[0].errorRate).toBe(3600 / 10000);
    expect(frames[0].servedRps).toBe(10000 - 3600);
    // healed at t=0.3s: traffic flows again, nothing drops
    expect(frames[3].perEdge["e-cache-db"].rps).toBe(3600);
    expect(frames[3].perNode["cache"].dropped).toBe(0);
    expect(frames[3].errorRate).toBe(0);
  });
});

describe("hotkey", () => {
  it("cuts storage capacity to the hot unit's share, leaving compute alone", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app", "app_server", { replicas: 4 }),
        node("cache", "cache", { replicas: 4 }),
        node("db", "db_sql"),
      ],
      [edge("c", "app"), edge("app", "cache"), edge("cache", "db")],
    );
    const sc = scenario({
      timeline: [{ at: 0, rule: "hotkey", skew: 0.5, forSec: 1 }],
    });
    const apply = compileRules(g, sc);
    const rng = mulberry32(sc.seed);
    // cache: min(1, 1/(0.5 × 4)) = 0.5; app is compute, db has 1 unit
    expect(apply(0, sc, rng).aliveFraction).toEqual({ cache: 0.5 });
    expect(apply(10, sc, rng).aliveFraction).toBeUndefined(); // window closed
  });

  it("leaves single-unit and mildly-skewed nodes at full capacity", () => {
    const g = graph(
      [node("c", "client"), node("cache", "cache", { replicas: 4 })],
      [edge("c", "cache")],
    );
    const sc = scenario({
      timeline: [{ at: 0, rule: "hotkey", skew: 0.25, forSec: 1 }],
    });
    // skew 0.25 = the fair 1/4 share: no penalty
    const apply = compileRules(g, sc);
    expect(apply(0, sc, mulberry32(sc.seed)).aliveFraction).toBeUndefined();
  });
});

describe("determinism through the full timeline", () => {
  it("same seed → byte-identical frames with every rule active", () => {
    const g = graph(
      [
        node("c", "client"),
        node("app", "app_server", { replicas: 4 }),
        node("cache", "cache", { hitRate: 0.8, replicas: 2 }),
        node("db", "db_sql", { replicas: 1 }),
      ],
      [edge("c", "app"), edge("app", "cache"), edge("cache", "db")],
    );
    const sc = scenario({
      durationSec: 3,
      baseRps: 8000,
      readRatio: 0.8,
      seed: 7,
      timeline: [
        { at: 0, rule: "ramp", toRps: 12000, overSec: 1 },
        { at: 0.5, rule: "spike", factor: 2, forSec: 0.5 },
        { at: 1, rule: "kill", target: "app_server", count: 2 },
        { at: 1.2, rule: "flush", target: "cache" },
        { at: 1.5, rule: "partition", target: "db", forSec: 0.5 },
        { at: 2, rule: "hotkey", skew: 0.6, forSec: 0.5 },
      ],
    });
    const run = () => simulate(g, sc, compileRules(g, sc));
    const a = run();
    expect(a).toHaveLength(30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
  });
});
