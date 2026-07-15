import type { DesignGraph, RunResult, Scenario, SimFrame } from "@/lib/core";
import { simulate } from "./engine";
import { compileRules } from "./rules";
import { evaluateVerdict } from "./verdict";

/** Assemble the RunResult contract over a finished (possibly partial) run. */
export function buildRunResult(
  graph: DesignGraph,
  scenario: Scenario,
  frames: SimFrame[],
): RunResult {
  return {
    scenarioId: scenario.id,
    designSnapshot: graph,
    frames,
    verdict: evaluateVerdict(graph, scenario, frames),
  };
}

/**
 * One-shot headless run: compile the timeline, simulate every tick, evaluate
 * the verdict. The CLI and CI entry point; the worker builds the same result
 * incrementally.
 */
export function runSimulation(
  graph: DesignGraph,
  scenario: Scenario,
): RunResult {
  return buildRunResult(
    graph,
    scenario,
    simulate(graph, scenario, compileRules(graph, scenario)),
  );
}
