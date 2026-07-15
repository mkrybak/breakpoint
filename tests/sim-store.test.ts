import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
  SimFrame,
} from "../src/lib/core";
import {
  compileRules,
  createWorkerHost,
  simulate,
  type SimWorkerHandle,
  type WorkerToMain,
} from "../src/lib/simulation";
import {
  appendLog,
  foldAggregates,
  LOG_LIMIT,
  setSimWorkerFactory,
  useSimStore,
  type SimAggregates,
  type SimLogEntry,
} from "../src/stores/sim-store";

function node(
  id: string,
  kind: DesignNode["kind"] = "app_server",
  config: DesignNode["config"] = {},
): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config };
}

function edge(source: string, target: string): DesignEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    trafficShare: 1,
    kind: "sync",
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

const small = graph([node("c", "client"), node("a")], [edge("c", "a")]);

/** 50 nodes: a client entry into a 49-deep app_server chain. */
function chain50(): DesignGraph {
  const nodes: DesignNode[] = [node("c", "client")];
  const edges: DesignEdge[] = [];
  let prev = "c";
  for (let i = 0; i < 49; i++) {
    const id = `a${i}`;
    nodes.push(node(id));
    edges.push(edge(prev, id));
    prev = id;
  }
  return graph(nodes, edges, "c");
}

/** A fake worker transport: the pure host, driven on fake timers, gated on dispose. */
function fakeFactory(): (onMessage: (m: WorkerToMain) => void) => SimWorkerHandle {
  return (onMessage) => {
    let disposed = false;
    const host = createWorkerHost((m) => {
      if (!disposed) onMessage(m);
    });
    return {
      post: (msg) => {
        if (!disposed) host.handle(msg);
      },
      dispose: () => {
        disposed = true;
        host.handle({ type: "stop" }); // clears the interval; the done is gated out
      },
    };
  };
}

const reference = (g: DesignGraph, sc: Scenario) =>
  simulate(g, sc, compileRules(g, sc));

beforeEach(() => {
  vi.useFakeTimers();
  setSimWorkerFactory(fakeFactory());
  useSimStore.getState().reset();
});

afterEach(() => {
  useSimStore.getState().reset();
  vi.useRealTimers();
});

describe("sim store", () => {
  it("starts idle and empty", () => {
    const s = useSimStore.getState();
    expect(s.status).toBe("idle");
    expect(s.frames).toEqual([]);
    expect(s.latestFrame).toBeNull();
    expect(s.result).toBeNull();
  });

  it("streams every frame for a 50-node graph with no drops, then finishes", () => {
    const g = chain50();
    const sc = scenario({ durationSec: 3 }); // 30 ticks at 10Hz
    useSimStore.getState().run(g, sc);
    expect(useSimStore.getState().status).toBe("running");

    vi.advanceTimersByTime(3000);

    const s = useSimStore.getState();
    expect(s.frames.length).toBe(30);
    expect(JSON.stringify(s.frames)).toBe(JSON.stringify(reference(g, sc)));
    expect(s.status).toBe("done");
    expect(s.result?.frames.length).toBe(30);
    expect(s.latestFrame).toBe(s.frames[29]);
  });

  it("pause halts the stream; resume completes it", () => {
    const sc = scenario({ durationSec: 2 });
    useSimStore.getState().run(small, sc);
    vi.advanceTimersByTime(500);
    expect(useSimStore.getState().frames.length).toBe(5);

    useSimStore.getState().pause();
    expect(useSimStore.getState().status).toBe("paused");
    vi.advanceTimersByTime(1000);
    expect(useSimStore.getState().frames.length).toBe(5);

    useSimStore.getState().resume();
    vi.advanceTimersByTime(1500);
    const s = useSimStore.getState();
    expect(s.frames.length).toBe(20);
    expect(s.status).toBe("done");
    expect(JSON.stringify(s.frames)).toBe(JSON.stringify(reference(small, sc)));
  });

  it("stop finalizes early with a result over the frames so far", () => {
    const sc = scenario({ durationSec: 2 });
    useSimStore.getState().run(small, sc);
    vi.advanceTimersByTime(500);
    useSimStore.getState().stop();

    const s = useSimStore.getState();
    expect(s.status).toBe("done");
    expect(s.frames.length).toBe(5);
    expect(s.result?.frames.length).toBe(5);

    vi.advanceTimersByTime(2000); // nothing streams after done
    expect(useSimStore.getState().frames.length).toBe(5);
  });

  it("chaos injects a rule at the current sim time", () => {
    const sc = scenario({ durationSec: 2 });
    useSimStore.getState().run(small, sc);
    vi.advanceTimersByTime(500); // next tick is t=0.5s
    useSimStore
      .getState()
      .chaos({ at: 999, rule: "spike", factor: 5, forSec: 1 });
    vi.advanceTimersByTime(1500);

    const withSpike: Scenario = {
      ...sc,
      timeline: [{ at: 0.5, rule: "spike", factor: 5, forSec: 1 }],
    };
    expect(JSON.stringify(useSimStore.getState().frames)).toBe(
      JSON.stringify(reference(small, withSpike)),
    );
  });

  it("a new run resets state and replaces the previous one", () => {
    useSimStore.getState().run(small, scenario({ durationSec: 2 }));
    vi.advanceTimersByTime(500);
    expect(useSimStore.getState().frames.length).toBe(5);

    useSimStore.getState().run(small, scenario({ id: "s2", durationSec: 1 }));
    expect(useSimStore.getState().frames.length).toBe(0);
    vi.advanceTimersByTime(1000);

    const s = useSimStore.getState();
    expect(s.frames.length).toBe(10);
    expect(s.status).toBe("done");
    expect(s.result?.scenarioId).toBe("s2");
  });

  it("aggregates track latest scalars, run peaks, and the bottleneck node", () => {
    const sc = scenario({ durationSec: 2, baseRps: 100000 }); // overloads "a"
    useSimStore.getState().run(small, sc);
    vi.advanceTimersByTime(2000);

    const s = useSimStore.getState();
    const last = s.frames[s.frames.length - 1];
    expect(s.aggregates.p95Ms).toBe(last.p95Ms);
    expect(s.aggregates.errorRate).toBe(last.errorRate);
    expect(s.aggregates.servedRps).toBe(last.servedRps);
    expect(s.aggregates.peakP95Ms).toBe(
      Math.max(...s.frames.map((f) => f.p95Ms)),
    );
    expect(s.aggregates.peakErrorRate).toBe(
      Math.max(...s.frames.map((f) => f.errorRate)),
    );

    let expId: string | null = null;
    let expUtil = -1;
    for (const id of small.nodes.map((n) => n.id)) {
      const u = last.perNode[id]?.util ?? 0;
      if (u > expUtil) {
        expUtil = u;
        expId = id;
      }
    }
    expect(s.aggregates.bottleneckNodeId).toBe(expId);
  });

  it("accumulates the event log while frames keep the full run", () => {
    const sc = scenario({ durationSec: 2, baseRps: 100000 });
    useSimStore.getState().run(small, sc);
    vi.advanceTimersByTime(2000);

    const s = useSimStore.getState();
    const totalEvents = s.frames.reduce((n, f) => n + f.events.length, 0);
    expect(s.log.length).toBe(Math.min(totalEvents, LOG_LIMIT));
    expect(s.log.length).toBeLessThanOrEqual(LOG_LIMIT);
    expect(s.frames.length).toBe(20); // full run retained regardless of log cap
  });
});

describe("foldAggregates", () => {
  const zero: SimAggregates = {
    elapsedSec: 0,
    p95Ms: 0,
    errorRate: 0,
    servedRps: 0,
    peakP95Ms: 0,
    peakErrorRate: 0,
    bottleneckNodeId: null,
    bottleneckUtil: 0,
  };

  const frame = (perNode: Record<string, number>) => ({
    t: 0.1,
    perNode: Object.fromEntries(
      Object.entries(perNode).map(([id, util]) => [
        id,
        { util, queued: 0, dropped: 0, state: "ok" as const },
      ]),
    ),
    perEdge: {},
    p95Ms: 120,
    errorRate: 0.02,
    servedRps: 900,
    events: [],
  });

  it("picks the first max-util node on ties, tracks peaks and latest", () => {
    const a = foldAggregates(zero, frame({ x: 0.5, y: 0.5, z: 0.4 }), [
      "x",
      "y",
      "z",
    ]);
    expect(a.bottleneckNodeId).toBe("x"); // tie x==y → first in order
    expect(a.p95Ms).toBe(120);
    expect(a.peakP95Ms).toBe(120);

    const b = foldAggregates({ ...a, peakP95Ms: 500 }, frame({ x: 0.9 }), ["x"]);
    expect(b.bottleneckNodeId).toBe("x");
    expect(b.peakP95Ms).toBe(500); // prior peak wins
  });

  it("returns a null bottleneck when there are no nodes", () => {
    const a = foldAggregates(zero, frame({}), []);
    expect(a.bottleneckNodeId).toBeNull();
    expect(a.bottleneckUtil).toBe(0);
  });
});

describe("appendLog", () => {
  // appendLog only reads frame.t and frame.events; the rest is filler.
  const eventFrame = (t: number, events: string[]): SimFrame => ({
    t,
    perNode: {},
    perEdge: {},
    p95Ms: 0,
    errorRate: 0,
    servedRps: 0,
    events,
  });

  it("ring-buffers to the limit, keeping the newest", () => {
    let log: SimLogEntry[] = [];
    for (let i = 0; i < 10; i++) {
      log = appendLog(log, eventFrame(i / 10, [`e${i}`]), 3);
    }
    expect(log.map((e) => e.message)).toEqual(["e7", "e8", "e9"]);
    expect(log[2].t).toBeCloseTo(0.9);
  });

  it("is a no-op for a frame with no events", () => {
    const prev: SimLogEntry[] = [{ t: 0, message: "keep" }];
    expect(appendLog(prev, eventFrame(1, []))).toBe(prev);
  });
});
