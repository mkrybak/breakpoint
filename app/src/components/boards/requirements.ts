import type { Scenario } from "@/lib/core";
import { useDesignStore } from "@/stores/design-store";
import { useScenarioStore } from "@/stores/scenario-store";

/** One line per scenario NFR, same values and wording the old notes template used. */
export function nfrRequirementTexts(scenario: Scenario): string[] {
  const { baseRps, pass } = scenario;
  const errorPct = Math.round(pass.maxErrorRate * 1000) / 10;
  return [
    `Target load: ${baseRps} RPS`,
    `p95 latency budget: ${pass.p95Ms} ms`,
    `Max error rate: ${errorPct}%`,
    ...(pass.maxLagSec !== undefined ? [`Max consumer lag: ${pass.maxLagSec}s`] : []),
    `Consistency: ${pass.consistency === "strong" ? "Strong" : "Eventual"}`,
  ];
}

/** Final index for a drag from `fromIndex` dropped into gap `gapIndex` (0..length, gap i = before item i). */
export function dropIndex(fromIndex: number, gapIndex: number): number {
  return gapIndex > fromIndex ? gapIndex - 1 : gapIndex;
}

/**
 * Seed the attached design's Non-functional list from the working scenario.
 * Once per design (the persisted `nonFunctionalSeeded` flag, T-13.1); only adds
 * items when the list is empty. Returns whether it added items.
 */
export function seedNonFunctionalOnce(designId: string): boolean {
  const s = useDesignStore.getState();
  if (s.designId !== designId || s.designMode === "quick") return false;
  return s.seedNonFunctional(nfrRequirementTexts(useScenarioStore.getState().scenario));
}
