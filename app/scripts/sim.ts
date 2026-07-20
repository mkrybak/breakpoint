import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import type { DesignGraph, Scenario, SimFrame } from "@/lib/core";
import { runSimulation, TICKS_PER_SEC } from "@/lib/simulation";

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    return fail(
      `cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function row(sec: number, frame: SimFrame): string {
  return [
    String(sec).padStart(4),
    Math.round(frame.servedRps).toString().padStart(8),
    frame.p95Ms.toFixed(1).padStart(9),
    (frame.errorRate * 100).toFixed(2).padStart(7),
  ].join("");
}

const [graphPath, scenarioArg] = process.argv.slice(2);
if (!graphPath || !scenarioArg) {
  fail(
    "usage: npm run sim -- <graph.json> <scenario>\n" +
      "  <scenario> is a .json path, or a name resolved beside the graph file",
  );
}

const scenarioPath = scenarioArg.endsWith(".json")
  ? scenarioArg
  : join(dirname(graphPath), `${scenarioArg}.json`);
const graph = readJson<DesignGraph>(graphPath);
const scenario = readJson<Scenario>(scenarioPath);

const { frames, verdict } = runSimulation(graph, scenario);

console.log(
  `${scenario.name} (${scenario.id}) — ${scenario.durationSec}s @ ${scenario.baseRps} RPS base, seed ${scenario.seed}`,
);
console.log(
  `graph: ${graphPath} — ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
);
console.log("");
console.log(
  [
    "t(s)".padStart(4),
    "served".padStart(8),
    "p95(ms)".padStart(9),
    "err%".padStart(7),
  ].join(""),
);
for (let sec = 0; sec * TICKS_PER_SEC < frames.length; sec++) {
  const first = sec * TICKS_PER_SEC;
  console.log(row(sec, frames[first]));
  for (const frame of frames.slice(first, first + TICKS_PER_SEC)) {
    for (const event of frame.events) console.log(`      ! ${event}`);
  }
}

console.log(`\nVerdict: ${verdict.passed ? "PASS" : "FAIL"}`);
for (const failure of verdict.failures) {
  console.log(`  ✗ [${failure.criterion}] ${failure.detail}`);
}
for (const advisory of verdict.advisories) {
  console.log(`  ~ ${advisory}`);
}
process.exit(verdict.passed ? 0 : 1);
