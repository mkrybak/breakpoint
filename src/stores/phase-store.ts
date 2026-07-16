import { create } from "zustand";
import type { Phase } from "@/lib/core";

/** One interview phase: id (matches core `Phase`), display label, budget. */
export interface PhaseConfig {
  phase: Phase;
  label: string;
  durationSec: number;
}

/** Ordered phases with their time budgets (02-data-model / M4 T-4.1 Accept). */
export const PHASES: PhaseConfig[] = [
  { phase: "requirements", label: "Requirements", durationSec: 5 * 60 },
  { phase: "entities", label: "Entities", durationSec: 2 * 60 },
  { phase: "api", label: "API", durationSec: 5 * 60 },
  { phase: "hld", label: "High-level design", durationSec: 15 * 60 },
  { phase: "deepdive", label: "Deep dives + stress test", durationSec: 10 * 60 },
];

/** Canvas building unlocks at this phase and stays unlocked after. */
export const CANVAS_UNLOCK_PHASE: Phase = "hld";

/** Position of a phase in the ordered flow (0-based). */
export function phaseIndex(phase: Phase): number {
  return PHASES.findIndex((p) => p.phase === phase);
}

/** The config record for a phase. Falls back to the first phase if unknown. */
export function phaseConfig(phase: Phase): PhaseConfig {
  return PHASES[phaseIndex(phase)] ?? PHASES[0];
}

/** The phase after `phase`, or null if it is the last phase. */
export function nextPhase(phase: Phase): Phase | null {
  const next = PHASES[phaseIndex(phase) + 1];
  return next ? next.phase : null;
}

/** Canvas is locked (no building) during phases before High-level design. */
export function isCanvasLocked(phase: Phase): boolean {
  return phaseIndex(phase) < phaseIndex(CANVAS_UNLOCK_PHASE);
}

/** Whole seconds → "mm:ss" (clamped at 0, minutes not zero-padded past 2). */
export function formatClock(sec: number): string {
  const clamped = Math.max(0, Math.floor(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface PhaseStore {
  /** Current interview phase. */
  phase: Phase;
  /** Seconds left in the current phase. */
  remainingSec: number;
  /** Whether the countdown is advancing. */
  running: boolean;
  /** Advance the clock 1s; auto-advances phase at 0; no-op when paused. */
  tick: () => void;
  /** Jump to the next phase (resetting its countdown); finishes if last. */
  skip: () => void;
  /** Add `sec` seconds to the current phase's countdown. */
  extend: (sec: number) => void;
  /** Pause/resume the countdown. */
  toggleRunning: () => void;
  /** Return to the first phase, full budget, running. */
  reset: () => void;
}

const FIRST = PHASES[0];

export const usePhaseStore = create<PhaseStore>((set) => ({
  phase: FIRST.phase,
  remainingSec: FIRST.durationSec,
  running: true,

  tick: () =>
    set((s) => {
      if (!s.running) return {};
      const remaining = s.remainingSec - 1;
      if (remaining > 0) return { remainingSec: remaining };
      const next = nextPhase(s.phase);
      if (next) return { phase: next, remainingSec: phaseConfig(next).durationSec };
      // Past the last phase: stop at zero.
      return { remainingSec: 0, running: false };
    }),

  skip: () =>
    set((s) => {
      const next = nextPhase(s.phase);
      if (!next) return { remainingSec: 0, running: false };
      return { phase: next, remainingSec: phaseConfig(next).durationSec };
    }),

  extend: (sec) => set((s) => ({ remainingSec: s.remainingSec + sec })),

  toggleRunning: () => set((s) => ({ running: !s.running })),

  reset: () =>
    set({ phase: FIRST.phase, remainingSec: FIRST.durationSec, running: true }),
}));
