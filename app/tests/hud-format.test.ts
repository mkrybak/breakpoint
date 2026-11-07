import { describe, expect, it } from "vitest";
import type { DesignGraph, RunResult, Scenario, Verdict } from "@/lib/core";
import {
  classifyLogSeverity,
  describeRunStatus,
  describeScenarioGoal,
  describeVerdictPlainly,
  formatBudgetPct,
  formatLag,
  formatMs,
  formatPct,
  formatRps,
  formatSec,
  hasAsyncNodes,
  PLAIN_CAPACITY_TIP,
} from "@/components/hud/hud-format";
import { starterGraph } from "@/components/quick/starter";

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

const steady: Scenario = {
  id: "steady",
  name: "Steady traffic",
  description: "Flat load.",
  durationSec: 30,
  baseRps: 300,
  readRatio: 0.9,
  seed: 1,
  timeline: [],
  pass: { p95Ms: 200, maxErrorRate: 0.01 },
};

function failed(failures: Verdict["failures"]): Verdict {
  return { passed: false, failures, advisories: [] };
}

describe("formatBudgetPct / formatSec", () => {
  it("drops trailing zeros", () => {
    expect(formatBudgetPct(0.01)).toBe("1%");
    expect(formatBudgetPct(0.005)).toBe("0.5%");
    expect(formatSec(4)).toBe("4s");
    expect(formatSec(12.300000001)).toBe("12.3s");
  });
});

describe("describeScenarioGoal", () => {
  it("states the p95 and error budgets", () => {
    expect(describeScenarioGoal(steady)).toBe(
      "Keep p95 under 200 ms and errors under 1%.",
    );
  });

  it("mentions kill survival when required", () => {
    const s = { ...steady, pass: { ...steady.pass, minSurvivedKills: 1 } };
    expect(describeScenarioGoal(s)).toMatch(
      /, even when a server goes down\.$/,
    );
  });

  it("mentions the consumer-lag limit when set", () => {
    const s = { ...steady, pass: { ...steady.pass, maxLagSec: 10 } };
    expect(
      describeScenarioGoal(s).endsWith(
        ", with queued work never more than 10s behind.",
      ),
    ).toBe(true);
  });
});

describe("formatLag / hasAsyncNodes", () => {
  it("shows one decimal under 10s, whole seconds above", () => {
    expect(formatLag(0)).toBe("0.0 s");
    expect(formatLag(3.25)).toBe("3.3 s");
    expect(formatLag(12.4)).toBe("12 s");
  });

  it("detects a queue in the design", () => {
    const withQueue: DesignGraph = {
      nodes: [
        {
          id: "q",
          kind: "queue",
          label: "q",
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      edges: [],
      entryNodeId: "",
    };
    expect(hasAsyncNodes(withQueue)).toBe(true);
    expect(hasAsyncNodes(starterGraph())).toBe(false);
  });
});

describe("describeVerdictPlainly", () => {
  it("returns one success sentence on a pass", () => {
    expect(
      describeVerdictPlainly(
        { passed: true, failures: [], advisories: [] },
        steady,
      ),
    ).toEqual([
      "Your design handled “Steady traffic”: p95 stayed under 200 ms and errors under 1%.",
    ]);
  });

  it("keeps the success sentence for a full-length pass", () => {
    expect(
      describeVerdictPlainly(
        { passed: true, failures: [], advisories: [] },
        steady,
        steady.durationSec,
      ),
    ).toEqual([
      "Your design handled “Steady traffic”: p95 stayed under 200 ms and errors under 1%.",
    ]);
  });

  it("doesn't claim success on a pass stopped early", () => {
    expect(
      describeVerdictPlainly(
        { passed: true, failures: [], advisories: [] },
        steady,
        2.8,
      ),
    ).toEqual([
      `Stopped at 2.8s of ${steady.durationSec}s. So far p95 stayed under 200 ms and errors under 1%. Let the run finish for the full result.`,
    ]);
  });

  it("keeps the failure lines on a failed run stopped early", () => {
    expect(
      describeVerdictPlainly(
        failed([{ criterion: "error-rate", atSec: 1.5, detail: "x" }]),
        steady,
        2.8,
      ),
    ).toEqual([
      "Too many requests failed: errors went over 1% at 1.5s.",
      PLAIN_CAPACITY_TIP,
    ]);
  });

  it("omits advisories on a pass", () => {
    const lines = describeVerdictPlainly(
      { passed: true, failures: [], advisories: ["single point of failure"] },
      steady,
    );
    expect(lines).toHaveLength(1);
    expect(lines.join(" ")).not.toMatch(/single point of failure/);
  });

  it("explains a lag failure in plain words", () => {
    const s = { ...steady, pass: { ...steady.pass, maxLagSec: 10 } };
    expect(
      describeVerdictPlainly(
        failed([{ criterion: "lag", atSec: 4.5, detail: "x" }]),
        s,
      ),
    ).toContain(
      "Background work fell behind: queue lag went over 10s at 4.5s.",
    );
  });

  it("explains a failure in plain words and adds the canvas tip", () => {
    expect(
      describeVerdictPlainly(
        failed([{ criterion: "error-rate", atSec: 12.3, detail: "x" }]),
        steady,
      ),
    ).toEqual([
      "Too many requests failed: errors went over 1% at 12.3s.",
      PLAIN_CAPACITY_TIP,
    ]);
  });

  it("has no capacity tip for a consistency-only failure", () => {
    const lines = describeVerdictPlainly(
      failed([{ criterion: "consistency", atSec: 0, detail: "stale reads" }]),
      steady,
    );
    expect(lines).toEqual([
      "Some reads can return stale data, but this scenario needs strong consistency.",
    ]);
  });

  it("falls back to the engine detail for an unknown criterion", () => {
    const lines = describeVerdictPlainly(
      failed([{ criterion: "zzz", atSec: 1, detail: "engine says no" }]),
      steady,
    );
    expect(lines[0]).toBe("engine says no");
  });

  it("collapses duplicate lines", () => {
    const lines = describeVerdictPlainly(
      failed([
        { criterion: "error-rate", atSec: 5, detail: "x" },
        { criterion: "error-rate", atSec: 5, detail: "x" },
      ]),
      steady,
    );
    expect(lines).toEqual([
      "Too many requests failed: errors went over 1% at 5s.",
      PLAIN_CAPACITY_TIP,
    ]);
  });
});
