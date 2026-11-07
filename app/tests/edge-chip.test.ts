import { describe, expect, it } from "vitest";
import {
  edgeChipSegments,
  formatTimeout,
  retryAmplification,
  type ChipSegment,
} from "../src/components/canvas/edges/edge-chip";
import type { FlowEdgeData } from "../src/stores/flow-adapter";

const texts = (segs: ChipSegment[]) => segs.map((s) => s.text);

const callEdge: FlowEdgeData = {
  kind: "sync",
  sourceKind: "app_server",
  supportsResilience: true,
};
const breaker = { errorThreshold: 0.5, tripAfterSec: 0.5, cooldownSec: 5 };
const storm: FlowEdgeData = { ...callEdge, timeoutMs: 200, retries: 3 };

describe("edgeChipSegments (T-12.3)", () => {
  it("shows the call multiplier on a call edge", () => {
    expect(texts(edgeChipSegments(callEdge, undefined))).toEqual(["×1"]);
    expect(
      texts(edgeChipSegments({ ...callEdge, callsPerRequest: 2.5 }, undefined)),
    ).toEqual(["×2.5"]);
  });

  it("shows share and auto on a split edge", () => {
    const split: FlowEdgeData = {
      kind: "sync",
      sourceKind: "lb",
      trafficShare: 0.5,
      supportsResilience: true,
    };
    expect(texts(edgeChipSegments(split, undefined))).toEqual(["50%", "auto"]);
    expect(
      texts(edgeChipSegments({ ...split, autoShare: false }, undefined)),
    ).toEqual(["50%"]);
  });

  it("hides stale settings on an async edge", () => {
    const asyncEdge: FlowEdgeData = {
      kind: "async",
      sourceKind: "app_server",
      retries: 3,
      timeoutMs: 200,
      supportsResilience: false,
    };
    expect(texts(edgeChipSegments(asyncEdge, undefined))).toEqual([
      "×1",
      "async",
    ]);
  });

  it("shows timeout and retries compactly", () => {
    expect(texts(edgeChipSegments(storm, undefined))).toEqual([
      "×1",
      "⏱\uFE0E200 ↻3",
    ]);
    expect(
      texts(edgeChipSegments({ ...callEdge, timeoutMs: 200 }, undefined)),
    ).toEqual(["×1", "⏱\uFE0E200"]);
    expect(
      texts(edgeChipSegments({ ...callEdge, retries: 3 }, undefined)),
    ).toEqual(["×1", "↻3"]);
    expect(
      texts(edgeChipSegments({ ...callEdge, retries: 0 }, undefined)),
    ).toEqual(["×1"]);
  });

  it("shows the breaker phase", () => {
    const edge: FlowEdgeData = { ...callEdge, breaker };
    expect(edgeChipSegments(edge, undefined).at(-1)).toEqual({
      key: "breaker",
      text: "breaker",
      tone: "muted",
    });
    expect(edgeChipSegments(edge, { rps: 0, breaker: "open" }).at(-1)).toEqual({
      key: "breaker",
      text: "breaker open",
      tone: "rose",
    });
    expect(
      edgeChipSegments(edge, { rps: 0, breaker: "half-open" }).at(-1),
    ).toEqual({ key: "breaker", text: "breaker probing", tone: "amber" });
    expect(
      edgeChipSegments({ ...edge, supportsResilience: false }, undefined).some(
        (s) => s.key === "breaker",
      ),
    ).toBe(false);
  });

  it("shows amplification while retries run", () => {
    expect(
      edgeChipSegments(storm, { rps: 16345, retryRps: 11845 }).at(-1),
    ).toEqual({ key: "amplification", text: "↻ 3.6× load", tone: "amber" });
    expect(edgeChipSegments(storm, { rps: 1300, retryRps: 300 }).at(-1)).toEqual(
      { key: "amplification", text: "↻ 1.3× load", tone: "muted" },
    );
    expect(
      edgeChipSegments(storm, { rps: 1520, retryRps: 20 }).some(
        (s) => s.key === "amplification",
      ),
    ).toBe(false);
    expect(edgeChipSegments(storm, { rps: 1500, retryRps: 500 }).at(-1)).toEqual(
      { key: "amplification", text: "↻ 1.5× load", tone: "muted" },
    );
  });

  it("orders settings, breaker, amplification", () => {
    expect(
      texts(
        edgeChipSegments(
          { ...storm, breaker },
          { rps: 16345, retryRps: 11845 },
        ),
      ),
    ).toEqual(["×1", "⏱\uFE0E200 ↻3", "breaker", "↻ 3.6× load"]);
  });
});

describe("formatTimeout", () => {
  it("uses ms below 1 s, else seconds", () => {
    expect(formatTimeout(200)).toBe("200");
    expect(formatTimeout(999.4)).toBe("999");
    expect(formatTimeout(1500)).toBe("1.5s");
    expect(formatTimeout(2000)).toBe("2s");
    expect(formatTimeout(60000)).toBe("60s");
  });
});

describe("retryAmplification", () => {
  it("is attempts ÷ fresh calls, null without retries or fresh calls", () => {
    expect(retryAmplification(undefined)).toBeNull();
    expect(retryAmplification({ rps: 1500 })).toBeNull();
    expect(retryAmplification({ rps: 1500, retryRps: 0 })).toBeNull();
    expect(retryAmplification({ rps: 300, retryRps: 300 })).toBeNull();
    expect(retryAmplification({ rps: 1300, retryRps: 300 })).toBeCloseTo(1.3);
  });
});
