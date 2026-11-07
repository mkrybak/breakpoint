import { create } from "zustand";
import type { Phase } from "@/lib/core";
import {
  loadPhaseClock,
  savePhaseClock,
  type PhaseClock,
} from "@/persistence/phase-clock";

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
  /** Seconds since the interview started; advances one per tick while running (T-4.3 clock). */
  elapsedSec: number;
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
  /** Design this clock belongs to and persists under (T-12.7); null = detached, nothing saved. */
  designId: string | null;
  /** Bind to `id`: restore its saved clock, or start a fresh one. Does not write. */
  attach: (id: string) => void;
  /** Stop persisting. Clock values are kept. */
  detach: () => void;
}

const FIRST = PHASES[0];

function freshClock(): PhaseClock {
  return {
    phase: FIRST.phase,
    remainingSec: FIRST.durationSec,
    elapsedSec: 0,
    running: true,
  };
}

export const usePhaseStore = create<PhaseStore>((set) => ({
  ...freshClock(),
  designId: null,

  tick: () =>
    set((s) => {
      if (!s.running) return {};
      const elapsedSec = s.elapsedSec + 1;
      const remaining = s.remainingSec - 1;
      if (remaining > 0) return { remainingSec: remaining, elapsedSec };
      const next = nextPhase(s.phase);
      if (next)
        return {
          phase: next,
          remainingSec: phaseConfig(next).durationSec,
          elapsedSec,
        };
      // Past the last phase: stop at zero.
      return { remainingSec: 0, running: false, elapsedSec };
    }),

  skip: () =>
    set((s) => {
      const next = nextPhase(s.phase);
      if (!next) return { remainingSec: 0, running: false };
      return { phase: next, remainingSec: phaseConfig(next).durationSec };
    }),

  extend: (sec) => set((s) => ({ remainingSec: s.remainingSec + sec })),

  toggleRunning: () => set((s) => ({ running: !s.running })),

  reset: () => set(freshClock()),

  attach: (id) => set({ designId: id, ...(loadPhaseClock(id) ?? freshClock()) }),

  detach: () => set({ designId: null }),
}));

// Persist the attached design's clock on every change (≈1 write/s while running;
// ~80 bytes). Attach/detach transitions are not edits: skipping them avoids
// echo-saving a just-loaded clock.
usePhaseStore.subscribe((state, prev) => {
  if (state.designId === null || state.designId !== prev.designId) return;
  if (
    state.phase === prev.phase &&
    state.remainingSec === prev.remainingSec &&
    state.elapsedSec === prev.elapsedSec &&
    state.running === prev.running
  )
    return;
  savePhaseClock(state.designId, {
    phase: state.phase,
    remainingSec: state.remainingSec,
    elapsedSec: state.elapsedSec,
    running: state.running,
  });
});
