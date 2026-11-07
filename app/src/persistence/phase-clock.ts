import type { Phase } from "@/lib/core";

/** Persisted Practice interview clock (T-12.7). localStorage key: bp:phase:<designId>. */
export interface PhaseClock {
  phase: Phase;
  remainingSec: number;
  elapsedSec: number;
  running: boolean;
}

const KEY_PREFIX = "bp:phase:";
const PHASES: Phase[] = ["requirements", "entities", "api", "hld", "deepdive"];

export function phaseClockStorageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** All-or-nothing guard: any missing/invalid field → null (caller starts a fresh clock). */
export function parsePhaseClock(text: string): PhaseClock | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { phase, remainingSec, elapsedSec, running } = value;
  if (!PHASES.includes(phase as Phase)) return null;
  if (!isNonNegativeFinite(remainingSec) || !isNonNegativeFinite(elapsedSec)) {
    return null;
  }
  if (typeof running !== "boolean") return null;
  return { phase: phase as Phase, remainingSec, elapsedSec, running };
}

/** Best-effort: no-ops without localStorage (SSR, node tests) or on quota errors. */
export function savePhaseClock(id: string, clock: PhaseClock): void {
  try {
    storage()?.setItem(phaseClockStorageKey(id), JSON.stringify(clock));
  } catch {
    // autosave must never take the app down
  }
}

export function loadPhaseClock(id: string): PhaseClock | null {
  try {
    const text = storage()?.getItem(phaseClockStorageKey(id));
    return text == null ? null : parsePhaseClock(text);
  } catch {
    return null;
  }
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
