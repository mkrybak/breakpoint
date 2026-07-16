import { describe, expect, it } from "vitest";
import type { DesignGraph, RunResult } from "@/lib/core";
import {
  classifyLogSeverity,
  describeRunStatus,
  formatMs,
  formatPct,
  formatRps,
} from "@/components/hud/hud-format";

const graph: DesignGraph = { nodes: [], edges: [], entryNodeId: "" };
function runResult(passed: boolean): RunResult {
  return {
    scenarioId: "s",
    designSnapshot: graph,
    frames: [],
    verdict: { passed, failures: [], advisories: [] },
  };
}

describe("formatMs", () => {
  it("rounds to whole ms", () => {
    expect(formatMs(142.4)).toBe("142 ms");
    expect(formatMs(0)).toBe("0 ms");
  });
});

describe("formatPct", () => {
  it("shows one decimal percent", () => {
    expect(formatPct(0.032)).toBe("3.2%");
    expect(formatPct(0)).toBe("0.0%");
    expect(formatPct(1)).toBe("100.0%");
  });
});

describe("formatRps", () => {
  it("uses k at/above 1000", () => {
    expect(formatRps(8200)).toBe("8.2k");
    expect(formatRps(1000)).toBe("1.0k");
  });
  it("rounds plain integers below 1000", () => {
    expect(formatRps(500)).toBe("500");
    expect(formatRps(0)).toBe("0");
  });
});

describe("classifyLogSeverity", () => {
  it("flags overloaded / shedding as critical", () => {
    expect(
      classifyLogSeverity("Postgres overloaded at 8.2k RPS — shedding load"),
    ).toBe("critical");
  });
  it("flags trailing down as critical", () => {
    expect(classifyLogSeverity("App-2 down")).toBe("critical");
  });
  it("flags saturated / running hot as warning", () => {
    expect(classifyLogSeverity("Postgres saturated at 8.2k RPS")).toBe(
      "warning",
    );
    expect(classifyLogSeverity("Cache running hot")).toBe("warning");
  });
  it("flags recovered as recovered", () => {
    expect(classifyLogSeverity("Postgres recovered")).toBe("recovered");
  });
  it("defaults to info", () => {
    expect(classifyLogSeverity("Simulation started")).toBe("info");
  });
});

describe("describeRunStatus", () => {
  it("is idle before a run", () => {
    expect(describeRunStatus("idle", null)).toEqual({
      label: "Idle",
      tone: "idle",
    });
  });
  it("is running while running or paused", () => {
    expect(describeRunStatus("running", null).tone).toBe("running");
    expect(describeRunStatus("paused", null).tone).toBe("running");
  });
  it("reports pass/fail when done", () => {
    expect(describeRunStatus("done", runResult(true))).toEqual({
      label: "Passed",
      tone: "pass",
    });
    expect(describeRunStatus("done", runResult(false))).toEqual({
      label: "Failed",
      tone: "fail",
    });
  });
});
