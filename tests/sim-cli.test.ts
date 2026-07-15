import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
} from "../src/lib/core";
import { simulate } from "../src/lib/simulation/engine";
import { runSimulation } from "../src/lib/simulation/run";
import { compileRules } from "../src/lib/simulation/rules";
import { evaluateVerdict } from "../src/lib/simulation/verdict";

function node(
  id: string,
  kind: DesignNode["kind"] = "app_server",
  config: DesignNode["config"] = {},
): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config };
}

function edge(source: string, target: string): DesignEdge {
  return { id: `e-${source}-${target}`, source, target, trafficShare: 1, kind: "sync" };
}

const appRoot = fileURLToPath(new URL("..", import.meta.url));

describe("runSimulation", () => {
  it("assembles the RunResult contract from one headless run", () => {
    const g: DesignGraph = {
      nodes: [node("c", "client"), node("a")],
      edges: [edge("c", "a")],
      entryNodeId: "c",
    };
    const sc: Scenario = {
      id: "s",
      name: "s",
      description: "",
      durationSec: 1,
      baseRps: 1000,
      readRatio: 1,
      timeline: [],
      pass: { p95Ms: 200, maxErrorRate: 0.01 },
      seed: 42,
    };
    const frames = simulate(g, sc, compileRules(g, sc));
    expect(runSimulation(g, sc)).toEqual({
      scenarioId: "s",
      designSnapshot: g,
      frames,
      verdict: evaluateVerdict(g, sc, frames),
    });
  });
});

describe("sim CLI", () => {
  it("runs the M2 demo headless and passes", () => {
    const out = execFileSync(
      process.execPath,
      [
        join(appRoot, "node_modules", "tsx", "dist", "cli.mjs"),
        "scripts/sim.ts",
        "examples/twitter.json",
        "black-friday",
      ],
      { cwd: appRoot, encoding: "utf8" },
    );
    expect(out).toContain("Black Friday (black-friday)");
    expect(out).toContain("Verdict: PASS");
  }, 30_000);
});
