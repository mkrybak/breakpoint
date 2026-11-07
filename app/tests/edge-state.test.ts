import { describe, expect, it } from "vitest";
import type { DesignEdge, DesignGraph, DesignNode } from "../src/lib/core";
import {
  buildEdgePolicies,
  edgePolicy,
  edgeSupportsResilience,
  initialEdgeState,
  stepEdge,
  type EdgePolicy,
  type EdgeTickInput,
} from "../src/lib/simulation/edge-state";
import { flowRps } from "../src/lib/simulation/engine";

function edge(overrides: Partial<DesignEdge> = {}): DesignEdge {
  return { id: "e", source: "a", target: "b", kind: "sync", ...overrides };
}

function node(id: string, kind: DesignNode["kind"]): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config: {} };
}

describe("edgePolicy", () => {
  it("is null for an async edge and a sync edge with nothing set", () => {
    expect(edgePolicy(edge({ kind: "async" }))).toBeNull();
    expect(edgePolicy(edge())).toBeNull();
  });

  it("rounds and clamps retries to 0–5", () => {
    expect(edgePolicy(edge({ retries: 2.6 }))).toEqual({ retries: 3 });
    expect(edgePolicy(edge({ retries: 9 }))).toEqual({ retries: 5 });
    expect(edgePolicy(edge({ retries: -1 }))).toBeNull();
  });

  it("treats a non-positive or non-finite timeout as absent and caps it at 60 s", () => {
    expect(edgePolicy(edge({ timeoutMs: 0 }))).toBeNull();
    expect(edgePolicy(edge({ timeoutMs: NaN }))).toBeNull();
    expect(edgePolicy(edge({ timeoutMs: Infinity }))).toBeNull();
    expect(edgePolicy(edge({ timeoutMs: 120000 }))).toEqual({
      timeoutMs: 60000,
      retries: 0,
    });
  });
});

describe("edgeSupportsResilience", () => {
  it("is false for a queue source and for an async edge, true for an lb source", () => {
    expect(edgeSupportsResilience(edge(), "queue")).toBe(false);
    expect(edgeSupportsResilience(edge({ kind: "async" }), "app_server")).toBe(
      false,
    );
    expect(edgeSupportsResilience(edge(), "lb")).toBe(true);
  });
});

describe("buildEdgePolicies", () => {
  it("skips a queue → worker sync edge that has retries", () => {
    const graph: DesignGraph = {
      nodes: [node("c", "client"), node("q", "queue"), node("w", "worker")],
      edges: [
        edge({ id: "c-q", source: "c", target: "q", retries: 1 }),
        edge({ id: "q-w", source: "q", target: "w", retries: 2 }),
      ],
      entryNodeId: "c",
    };
    expect([...buildEdgePolicies(graph)]).toEqual([["c-q", { retries: 1 }]]);
  });

  it("gives a breaker-only edge a zero-retry policy so it reports failRate (T-8.6)", () => {
    const breaker = { errorThreshold: 0.5, tripAfterSec: 0.5, cooldownSec: 5 };
    const graph: DesignGraph = {
      nodes: [node("c", "client"), node("a", "app_server"), node("q", "queue"), node("w", "worker")],
      edges: [
        edge({ id: "c-a", source: "c", target: "a", breaker }),
        edge({ id: "a-q", source: "a", target: "q", kind: "async", breaker }),
        edge({ id: "q-w", source: "q", target: "w", breaker }),
      ],
      entryNodeId: "c",
    };
    expect([...buildEdgePolicies(graph)]).toEqual([["c-a", { retries: 0 }]]);
  });
});

describe("stepEdge", () => {
  const policy: EdgePolicy = { retries: 2, timeoutMs: 100 };
  const state = {
    retryCarry: [
      { read: 1000, write: 0 },
      { read: 500, write: 0 },
    ],
  };
  const input: EdgeTickInput = {
    fresh: { read: 4000, write: 0 },
    dead: false,
    rejectFraction: 0.25,
    targetPathMs: 50,
  };
  const f = 0.25 + 0.75 * Math.exp(-100 / 50);

  it("carries each level's failures one level up; the last level's are exhausted", () => {
    const step = stepEdge(policy, state, input);
    expect(step.next.retryCarry).toEqual([
      { read: 4000 * f, write: 0 },
      { read: 1000 * f, write: 0 },
    ]);
    expect(step.retryRps).toBe(1500);
    expect(step.failRate).toBe(f);
    expect(step.rejectedRps).toBe(1375);
    expect(step.exhaustedRps).toBe(500 * f);
  });

  it("a dead edge resets the carry and fails every attempt", () => {
    const step = stepEdge(policy, state, { ...input, dead: true });
    expect(step.next).toEqual(initialEdgeState(policy));
    expect(step.next.retryCarry).toHaveLength(2);
    expect(step.failRate).toBe(1);
    expect(step.rejectedRps).toBe(0);
    expect(step.exhaustedRps).toBe(0);
  });

  it("a breaker's admit scales the carry: rejected calls schedule no retry (T-8.6)", () => {
    const step = stepEdge(
      { retries: 2 },
      {
        retryCarry: [
          { read: 1000, write: 0 },
          { read: 0, write: 0 },
        ],
      },
      {
        fresh: { read: 400, write: 0 },
        dead: false,
        rejectFraction: 0.5,
        targetPathMs: 0,
        admit: 0.1,
      },
    );
    expect(step.retryRps).toBe(100);
    // level 2 is built from the 100 admitted retries, not the 1000 carried
    expect(step.next.retryCarry).toEqual([
      { read: 200, write: 0 },
      { read: 50, write: 0 },
    ]);
    expect(step.exhaustedRps).toBe(0);
    expect(step.rejectedRps).toBe(250);
  });

  it("with retries 0 every failure is exhausted", () => {
    const step = stepEdge(
      { retries: 0, timeoutMs: 100 },
      { retryCarry: [] },
      input,
    );
    expect(step.next.retryCarry).toEqual([]);
    expect(step.exhaustedRps).toBe(flowRps(input.fresh) * f);
  });
});
