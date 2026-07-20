import { describe, expect, it } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
  SimFrame,
} from "../src/lib/core";
import { simulate } from "../src/lib/simulation/engine";
import { compileRules } from "../src/lib/simulation/rules";
import {
  consistencyCriterion,
  errorRateCriterion,
  evaluateVerdict,
  killSurvivalCriterion,
  overProvisioningAdvisor,
  p95Criterion,
  prematureShardingAdvisor,
  queueOnSyncPathAdvisor,
} from "../src/lib/simulation/verdict";

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

function frame(t: number, overrides: Partial<SimFrame> = {}): SimFrame {
  return {
    t,
    perNode: {},
    perEdge: {},
    p95Ms: 10,
    errorRate: 0,
    servedRps: 0,
    events: [],
    ...overrides,
  };
}

/** `count` frames at 10/s; per-tick overrides from `make` */
function frameSeries(
  count: number,
  make: (tick: number) => Partial<SimFrame> = () => ({}),
): SimFrame[] {
  return Array.from({ length: count }, (_, i) => frame(i / 10, make(i)));
}

function nodeMetrics(util: number): SimFrame["perNode"][string] {
  return { util, queued: 0, dropped: 0, state: "ok" };
}

const g = graph([node("c", "client"), node("a")], [edge("c", "a")]);

describe("p95 criterion", () => {
  it("fails once p95 exceeds budget for more than 5 consecutive seconds", () => {
    const frames = frameSeries(60, (i) =>
      i >= 5 && i < 56 ? { p95Ms: 250 } : {},
    );
    expect(p95Criterion({ graph: g, scenario: scenario(), frames })).toEqual([
      {
        criterion: "p95",
        atSec: 0.5,
        detail: "p95 above 200ms budget for over 5s starting t=0.5s",
      },
    ]);
  });

  it("exactly 5 seconds over budget passes", () => {
    const frames = frameSeries(60, (i) =>
      i >= 5 && i < 55 ? { p95Ms: 250 } : {},
    );
    expect(p95Criterion({ graph: g, scenario: scenario(), frames })).toEqual(
      [],
    );
  });

  it("a single good tick resets the streak", () => {
    const frames = frameSeries(101, (i) => (i === 50 ? {} : { p95Ms: 250 }));
    expect(p95Criterion({ graph: g, scenario: scenario(), frames })).toEqual(
      [],
    );
  });
});

describe("error-rate criterion", () => {
  it("ignores breaches inside the 3s warmup", () => {
    const frames = frameSeries(40, (i) => (i === 29 ? { errorRate: 0.5 } : {}));
    expect(
      errorRateCriterion({ graph: g, scenario: scenario(), frames }),
    ).toEqual([]);
  });

  it("fails on the first breach after warmup", () => {
    const frames = frameSeries(40, (i) => (i >= 30 ? { errorRate: 0.5 } : {}));
    expect(
      errorRateCriterion({ graph: g, scenario: scenario(), frames }),
    ).toEqual([
      {
        criterion: "error-rate",
        atSec: 3,
        detail: "error rate 50.0% over 1.0% budget at t=3s",
      },
    ]);
  });
});

describe("kill-survival criterion", () => {
  const killScenario = (pass: Scenario["pass"]) =>
    scenario({
      durationSec: 13,
      timeline: [{ at: 1, rule: "kill", target: "a" }],
      pass,
    });

  it("fails when a kill breaches the error budget inside its 10s window", () => {
    const sc = killScenario({
      p95Ms: 200,
      maxErrorRate: 0.01,
      minSurvivedKills: 1,
    });
    // tick 15 is inside the warmup — only this criterion catches it
    const frames = frameSeries(130, (i) => (i === 15 ? { errorRate: 0.3 } : {}));
    expect(killSurvivalCriterion({ graph: g, scenario: sc, frames })).toEqual([
      {
        criterion: "kill-survival",
        atSec: 1.5,
        detail: 'kill "a" at t=1s not survived — error rate 30.0% at t=1.5s',
      },
    ]);
    expect(errorRateCriterion({ graph: g, scenario: sc, frames })).toEqual([]);
  });

  it("a breach outside the window is not blamed on the kill", () => {
    const sc = killScenario({
      p95Ms: 200,
      maxErrorRate: 0.01,
      minSurvivedKills: 1,
    });
    const frames = frameSeries(130, (i) =>
      i === 115 ? { errorRate: 0.3 } : {},
    );
    expect(killSurvivalCriterion({ graph: g, scenario: sc, frames })).toEqual(
      [],
    );
    // ... the error-rate criterion still catches it
    expect(
      errorRateCriterion({ graph: g, scenario: sc, frames }),
    ).toEqual([
      {
        criterion: "error-rate",
        atSec: 11.5,
        detail: "error rate 30.0% over 1.0% budget at t=11.5s",
      },
    ]);
  });

  it("inactive without minSurvivedKills", () => {
    const sc = killScenario({ p95Ms: 200, maxErrorRate: 0.01 });
    const frames = frameSeries(130, (i) => (i === 15 ? { errorRate: 0.3 } : {}));
    expect(killSurvivalCriterion({ graph: g, scenario: sc, frames })).toEqual(
      [],
    );
  });
});

describe("consistency criterion", () => {
  const strong = scenario({
    pass: { p95Ms: 200, maxErrorRate: 0.01, consistency: "strong" },
  });
  const readPath = (store: DesignNode, edgeKind: "sync" | "async" = "sync") =>
    graph(
      [node("c", "client"), node("a"), store],
      [edge("c", "a"), edge("a", store.id, { kind: edgeKind })],
    );

  it("fails on a default (eventual) NoSQL store on the read path", () => {
    const input = {
      graph: readPath(node("n", "db_nosql")),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([
      {
        criterion: "consistency",
        atSec: 0,
        detail:
          'strong consistency violated: read path c → a → n hits eventually-consistent "n" (consistencyMode "eventual")',
      },
    ]);
  });

  it("quorum NoSQL passes", () => {
    const input = {
      graph: readPath(node("n", "db_nosql", { consistencyMode: "quorum" })),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([]);
  });

  it("inactive without the strong-consistency NFR", () => {
    const input = {
      graph: readPath(node("n", "db_nosql")),
      scenario: scenario(),
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([]);
  });

  it("fails on SQL read replicas without read-your-writes", () => {
    const input = {
      graph: readPath(node("d", "db_sql", { replicas: 2 })),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([
      {
        criterion: "consistency",
        atSec: 0,
        detail:
          'strong consistency violated: read path c → a → d hits eventually-consistent "d" (2 read replica(s) without read-your-writes)',
      },
    ]);
  });

  it("SQL read replicas with read-your-writes pass", () => {
    const input = {
      graph: readPath(node("d", "db_sql", { replicas: 2, readYourWrites: true })),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([]);
  });

  it("SQL without replicas passes", () => {
    const input = {
      graph: readPath(node("d", "db_sql")),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([]);
  });

  it("a store reached only via async edges is off the read path", () => {
    const input = {
      graph: readPath(node("n", "db_nosql"), "async"),
      scenario: strong,
      frames: [],
    };
    expect(consistencyCriterion(input)).toEqual([]);
  });
});

describe("over-provisioning advisor", () => {
  it("fires when every capacity-limited node idles below 10% all run", () => {
    const frames = frameSeries(10, () => ({
      perNode: { c: nodeMetrics(0), a: nodeMetrics(0.05) },
    }));
    expect(
      overProvisioningAdvisor({ graph: g, scenario: scenario(), frames }),
    ).toEqual([
      "Over-provisioned: no capacity-limited component ever exceeds 10% utilization",
    ]);
  });

  it("silent when any node ever reaches 10%", () => {
    const frames = frameSeries(10, (i) => ({
      perNode: { c: nodeMetrics(0), a: nodeMetrics(i === 7 ? 0.15 : 0.05) },
    }));
    expect(
      overProvisioningAdvisor({ graph: g, scenario: scenario(), frames }),
    ).toEqual([]);
  });

  it("silent when no node is capacity-limited", () => {
    const unlimited = graph([node("c", "client")], []);
    const frames = frameSeries(10, () => ({ perNode: { c: nodeMetrics(0) } }));
    expect(
      overProvisioningAdvisor({ graph: unlimited, scenario: scenario(), frames }),
    ).toEqual([]);
  });
});

describe("premature-sharding advisor", () => {
  const shardedGraph = (config: DesignNode["config"]) =>
    graph(
      [node("c", "client"), node("a"), node("d", "db_sql", config)],
      [edge("c", "a"), edge("a", "d")],
    );

  it("fires when the peak write load fits a single primary", () => {
    const sc = scenario({ readRatio: 0.5 });
    expect(
      prematureShardingAdvisor({
        graph: shardedGraph({ sharded: true }),
        scenario: sc,
        frames: frameSeries(10),
      }),
    ).toEqual([
      'Premature sharding: "d" is sharded but peak write load 1k RPS fits a single primary (15k RPS)',
    ]);
  });

  it("silent when not sharded", () => {
    expect(
      prematureShardingAdvisor({
        graph: shardedGraph({}),
        scenario: scenario({ readRatio: 0.5 }),
        frames: frameSeries(10),
      }),
    ).toEqual([]);
  });

  it("silent when the timeline ramps writes past a single primary", () => {
    const sc = scenario({
      readRatio: 0,
      timeline: [{ at: 0, rule: "ramp", toRps: 40000, overSec: 0.5 }],
    });
    expect(
      prematureShardingAdvisor({
        graph: shardedGraph({ sharded: true }),
        scenario: sc,
        frames: frameSeries(10),
      }),
    ).toEqual([]);
  });
});

describe("queue-on-sync-path advisor", () => {
  it("fires on a queue reached via a sync edge", () => {
    const q = graph([node("c", "client"), node("q", "queue")], [edge("c", "q")]);
    expect(
      queueOnSyncPathAdvisor({ graph: q, scenario: scenario(), frames: [] }),
    ).toEqual([
      'Queue on sync path: "q" is reached synchronously (c → q) — its delivery delay lands on client latency',
    ]);
  });

  it("silent when the queue hangs off an async edge", () => {
    const q = graph(
      [node("c", "client"), node("q", "queue")],
      [edge("c", "q", { kind: "async" })],
    );
    expect(
      queueOnSyncPathAdvisor({ graph: q, scenario: scenario(), frames: [] }),
    ).toEqual([]);
  });
});

describe("evaluateVerdict", () => {
  it("healthy run passes with no failures or advisories", () => {
    const healthy = graph(
      [node("c", "client"), node("a", "app_server", { replicas: 2 })],
      [edge("c", "a")],
    );
    const sc = scenario();
    const frames = simulate(healthy, sc, compileRules(healthy, sc));
    expect(evaluateVerdict(healthy, sc, frames)).toEqual({
      passed: true,
      failures: [],
      advisories: [],
    });
  });

  it("sustained overload fails the error-rate criterion", () => {
    // golden 1 dynamics: 5k offered vs 4k capacity — drops from tick 2,
    // steady errorRate 1000/5000 = 0.2; first checked frame is t=3
    const overloaded = graph(
      [node("c", "client"), node("a")],
      [edge("c", "a")],
    );
    const sc = scenario({
      durationSec: 4,
      baseRps: 5000,
      pass: { p95Ms: 10000, maxErrorRate: 0.01 },
    });
    const frames = simulate(overloaded, sc, compileRules(overloaded, sc));
    expect(evaluateVerdict(overloaded, sc, frames)).toEqual({
      passed: false,
      failures: [
        {
          criterion: "error-rate",
          atSec: 3,
          detail: "error rate 20.0% over 1.0% budget at t=3s",
        },
      ],
      advisories: [],
    });
  });
});
