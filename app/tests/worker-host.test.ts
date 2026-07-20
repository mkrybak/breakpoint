import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  RunResult,
  Scenario,
  SimFrame,
  StressRule,
} from "../src/lib/core";
import { simulate } from "../src/lib/simulation/engine";
import { buildRunResult } from "../src/lib/simulation/run";
import { compileRules } from "../src/lib/simulation/rules";
import {
  createWorkerHost,
  type WorkerToMain,
} from "../src/lib/simulation/worker-host";

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
    durationSec: 2,
    baseRps: 1000,
    readRatio: 1,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01 },
    seed: 42,
    ...overrides,
  };
}

const g = graph([node("c", "client"), node("a")], [edge("c", "a")]);
const sc = scenario(); // 20 ticks

function makeHost() {
  const posted: WorkerToMain[] = [];
  const host = createWorkerHost((msg) => posted.push(msg));
  return { host, posted };
}

function frames(posted: WorkerToMain[]): SimFrame[] {
  return posted.flatMap((m) => (m.type === "frame" ? [m.frame] : []));
}

function results(posted: WorkerToMain[]): RunResult[] {
  return posted.flatMap((m) => (m.type === "done" ? [m.result] : []));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("worker host", () => {
  it("run streams every frame then done, byte-identical to the batch engine", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: sc });
    vi.advanceTimersByTime(2000);

    const reference = simulate(g, sc, compileRules(g, sc));
    expect(frames(posted).length).toBe(20);
    expect(JSON.stringify(frames(posted))).toBe(JSON.stringify(reference));
    expect(posted[posted.length - 1].type).toBe("done");
    expect(JSON.stringify(results(posted)[0])).toBe(
      JSON.stringify(buildRunResult(g, sc, reference)),
    );

    vi.advanceTimersByTime(1000); // timer cleared — nothing after done
    expect(posted.length).toBe(21);
  });

  it("pause halts the stream; resume completes it without perturbing determinism", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: sc });
    vi.advanceTimersByTime(500);
    expect(frames(posted).length).toBe(5);

    host.handle({ type: "pause" });
    vi.advanceTimersByTime(1000);
    expect(frames(posted).length).toBe(5);

    host.handle({ type: "resume" });
    vi.advanceTimersByTime(1500);
    expect(frames(posted).length).toBe(20);
    expect(results(posted).length).toBe(1);
    expect(JSON.stringify(frames(posted))).toBe(
      JSON.stringify(simulate(g, sc, compileRules(g, sc))),
    );
  });

  it("stop finalizes early with the verdict over the frames so far", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: sc });
    vi.advanceTimersByTime(500);
    host.handle({ type: "stop" });

    const partial = simulate(g, sc, compileRules(g, sc)).slice(0, 5);
    expect(JSON.stringify(results(posted)[0])).toBe(
      JSON.stringify(buildRunResult(g, sc, partial)),
    );

    vi.advanceTimersByTime(2000);
    expect(frames(posted).length).toBe(5);
    expect(results(posted).length).toBe(1);
  });

  it("chaos injects a rule re-anchored at the current sim time", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: sc });
    vi.advanceTimersByTime(500); // 5 frames done — next tick is t=0.5s
    const rule: StressRule = { at: 999, rule: "spike", factor: 5, forSec: 1 };
    host.handle({ type: "chaos", rule });
    vi.advanceTimersByTime(1500);

    const withSpike: Scenario = {
      ...sc,
      timeline: [{ at: 0.5, rule: "spike", factor: 5, forSec: 1 }],
    };
    expect(JSON.stringify(frames(posted))).toBe(
      JSON.stringify(simulate(g, withSpike, compileRules(g, withSpike))),
    );
  });

  it("a second run replaces the first — one done, for the new run", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: sc });
    vi.advanceTimersByTime(300);
    const sc2 = scenario({ id: "s2", durationSec: 1, baseRps: 500 });
    host.handle({ type: "run", graph: g, scenario: sc2 });
    vi.advanceTimersByTime(1000);

    expect(frames(posted).length).toBe(3 + 10);
    expect(results(posted).length).toBe(1);
    expect(results(posted)[0].scenarioId).toBe("s2");
    expect(results(posted)[0].frames.length).toBe(10);
  });

  it("a zero-duration run completes immediately", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "run", graph: g, scenario: scenario({ durationSec: 0 }) });
    expect(results(posted).length).toBe(1);
    expect(results(posted)[0].frames).toEqual([]);
  });

  it("messages without an active run are ignored", () => {
    const { host, posted } = makeHost();
    host.handle({ type: "pause" });
    host.handle({ type: "resume" });
    host.handle({ type: "stop" });
    host.handle({
      type: "chaos",
      rule: { at: 0, rule: "spike", factor: 2, forSec: 1 },
    });
    vi.advanceTimersByTime(1000);
    expect(posted).toEqual([]);
  });
});
