import { create } from "zustand";
import type { Scenario } from "@/lib/core";
import { getScenarioPreset, SCENARIO_PRESETS } from "@/lib/scenarios";

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

interface ScenarioStore {
  /** The working scenario: a preset clone with the interviewer's NFR edits. */
  scenario: Scenario;
  /** Replace the working scenario with a fresh clone of a preset. */
  selectPreset: (id: string) => void;
  /** Edit the offered base load (RequirementsPanel). */
  setBaseRps: (rps: number) => void;
  /** Patch the numeric NFR budgets (RequirementsPanel). */
  updatePass: (patch: { p95Ms?: number; maxErrorRate?: number }) => void;
  /** Toggle the strong-consistency NFR on/off. */
  setStrongConsistency: (on: boolean) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  scenario: structuredClone(DEFAULT_PRESET),

  selectPreset: (id) =>
    set(() => ({
      scenario: structuredClone(getScenarioPreset(id) ?? DEFAULT_PRESET),
    })),

  setBaseRps: (rps) =>
    set((s) => ({ scenario: { ...s.scenario, baseRps: rps } })),

  updatePass: (patch) =>
    set((s) => ({
      scenario: { ...s.scenario, pass: { ...s.scenario.pass, ...patch } },
    })),

  setStrongConsistency: (on) =>
    set((s) => {
      const pass = { ...s.scenario.pass };
      if (on) pass.consistency = "strong";
      else delete pass.consistency;
      return { scenario: { ...s.scenario, pass } };
    }),
}));
