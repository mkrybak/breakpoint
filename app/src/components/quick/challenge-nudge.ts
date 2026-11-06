import type { RunResult, Scenario } from "@/lib/core";
import type { QuickChallenge } from "@/lib/scenarios";
import { TICKS_PER_SEC } from "@/lib/simulation";
import type { SimStatus } from "@/stores/sim-store";

/** True when the run reached the scenario's last tick (Stop finalizes early). */
export function ranFullLength(result: RunResult, scenario: Scenario): boolean {
  return (
    result.frames.length >= Math.round(scenario.durationSec * TICKS_PER_SEC)
  );
}

/** The challenge this finished run solved, or null. */
export function challengeSolvedBy(
  challenges: readonly QuickChallenge[],
  result: RunResult | null,
  scenario: Scenario | null,
): QuickChallenge | null {
  if (!result || !scenario) return null;
  if (!result.verdict.passed || result.scenarioId !== scenario.id) return null;
  if (!ranFullLength(result, scenario)) return null;
  return challenges.find((c) => c.scenarioId === scenario.id) ?? null;
}

/** First challenge in order that isn't solved and isn't `skip`. */
export function nextUnsolvedChallenge(
  challenges: readonly QuickChallenge[],
  solved: readonly string[],
  skip?: string,
): QuickChallenge | null {
  return (
    challenges.find(
      (c) => c.scenarioId !== skip && !solved.includes(c.scenarioId),
    ) ?? null
  );
}

export type NudgeView =
  | { kind: "none" }
  | { kind: "active"; challenge: QuickChallenge; running: boolean }
  | { kind: "solved"; challenge: QuickChallenge; next: QuickChallenge | null }
  | { kind: "retry"; challenge: QuickChallenge; stopped: boolean }
  | {
      kind: "suggest";
      next: QuickChallenge;
      /** full-length pass */
      passed: boolean;
    }
  | { kind: "all-done" };

export interface NudgeInput {
  challenges: readonly QuickChallenge[];
  solved: readonly string[];
  /** the selected scenario (scenario-store) */
  scenarioId: string;
  status: SimStatus;
  result: RunResult | null;
  runScenario: Scenario | null;
}

export function describeNudge(input: NudgeInput): NudgeView {
  const { challenges, solved, scenarioId, status, result, runScenario } = input;
  const selected = challenges.find((c) => c.scenarioId === scenarioId) ?? null;
  if (
    status !== "done" ||
    !result ||
    !runScenario ||
    runScenario.id !== scenarioId
  ) {
    return selected
      ? {
          kind: "active",
          challenge: selected,
          running: status === "running" || status === "paused",
        }
      : { kind: "none" };
  }
  if (selected) {
    if (challengeSolvedBy(challenges, result, runScenario)) {
      return {
        kind: "solved",
        challenge: selected,
        next: nextUnsolvedChallenge(challenges, solved, selected.scenarioId),
      };
    }
    return {
      kind: "retry",
      challenge: selected,
      stopped: !ranFullLength(result, runScenario),
    };
  }
  const next = nextUnsolvedChallenge(challenges, solved);
  const held = result.verdict.passed && ranFullLength(result, runScenario);
  return next ? { kind: "suggest", next, passed: held } : { kind: "all-done" };
}
