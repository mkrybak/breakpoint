import type { Scenario } from "@/lib/core";
import { SCENARIO_PRESETS } from "@/lib/scenarios";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

/** Switch Quick mode's scenario. Clears the last run (its verdict was for the old scenario). T-7.6's nudge reuses this. */
export function switchQuickScenario(scenario: Scenario): void {
  useSimStore.getState().reset();
  useScenarioStore.getState().setScenario(scenario);
}

/** Leaving Quick: drop the run and restore Practice's default preset so nothing leaks into Practice. */
export function leaveQuickMode(): void {
  useSimStore.getState().reset();
  useScenarioStore.getState().selectPreset(SCENARIO_PRESETS[0].id);
}
