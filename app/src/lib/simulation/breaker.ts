/**
 * Per-edge circuit breaker state machine (T-8.6). A leaf: type-only imports
 * from core, ticksPerSec passed in, so it adds no cycle with ./engine. The
 * per-run state lives in createSimRun's `breakers` map.
 */
import type { BreakerPhase, DesignEdge, EdgeBreaker } from "@/lib/core";

export const DEFAULT_BREAKER: EdgeBreaker = {
  errorThreshold: 0.5,
  tripAfterSec: 0.5,
  cooldownSec: 5,
};
/** UI input ranges and the engine's clamp — one source of truth. */
export const BREAKER_LIMITS = {
  errorThreshold: { min: 0.05, max: 0.95, step: 0.05 },
  tripAfterSec: { min: 0.1, max: 10, step: 0.1 },
  cooldownSec: { min: 0.5, max: 60, step: 0.5 },
} as const;
/** Share of the edge's calls a half-open breaker lets through for its one probe tick. */
export const BREAKER_PROBE_FRACTION = 0.1;

export interface ResolvedBreaker {
  threshold: number;
  tripTicks: number;
  cooldownTicks: number;
}
export interface BreakerState {
  phase: BreakerPhase;
  /** consecutive closed ticks over the threshold */
  streak: number;
  /** open ticks completed since it (re)opened */
  openTicks: number;
}
export const CLOSED_BREAKER: BreakerState = {
  phase: "closed",
  streak: 0,
  openTicks: 0,
};

function clampTo(
  value: number,
  limit: { min: number; max: number },
  fallback: number,
): number {
  return Number.isFinite(value)
    ? Math.min(limit.max, Math.max(limit.min, value))
    : fallback;
}

/** null = no breaker (absent, or an async edge). Junk values clamp / fall back to defaults. */
export function resolveBreaker(
  edge: DesignEdge,
  ticksPerSec: number,
): ResolvedBreaker | null {
  if (edge.kind !== "sync" || !edge.breaker) return null;
  const b = edge.breaker;
  const L = BREAKER_LIMITS;
  const D = DEFAULT_BREAKER;
  return {
    threshold: clampTo(b.errorThreshold, L.errorThreshold, D.errorThreshold),
    tripTicks: Math.max(
      1,
      Math.round(
        clampTo(b.tripAfterSec, L.tripAfterSec, D.tripAfterSec) * ticksPerSec,
      ),
    ),
    cooldownTicks: Math.max(
      1,
      Math.round(
        clampTo(b.cooldownSec, L.cooldownSec, D.cooldownSec) * ticksPerSec,
      ),
    ),
  };
}

/** Start of tick: maybe half-open, then the fraction of the edge's calls admitted this tick. */
export function beginBreakerTick(
  state: BreakerState,
  cfg: ResolvedBreaker,
): { state: BreakerState; pass: number; halfOpened: boolean } {
  if (state.phase === "open" && state.openTicks >= cfg.cooldownTicks) {
    return {
      state: { phase: "half-open", streak: 0, openTicks: 0 },
      pass: BREAKER_PROBE_FRACTION,
      halfOpened: true,
    };
  }
  const pass =
    state.phase === "closed"
      ? 1
      : state.phase === "open"
        ? 0
        : BREAKER_PROBE_FRACTION;
  return { state, pass, halfOpened: false };
}

/** End of tick: fold this tick's failure rate (over admitted calls only). */
export function endBreakerTick(
  state: BreakerState,
  cfg: ResolvedBreaker,
  failRate: number,
): { state: BreakerState; transition?: "open" | "closed" } {
  const over = failRate > cfg.threshold;
  if (state.phase === "open") {
    return { state: { ...state, openTicks: state.openTicks + 1 } };
  }
  if (state.phase === "half-open") {
    return over
      ? {
          state: { phase: "open", streak: 0, openTicks: 0 },
          transition: "open",
        }
      : { state: CLOSED_BREAKER, transition: "closed" };
  }
  const streak = over ? state.streak + 1 : 0;
  if (streak >= cfg.tripTicks) {
    return {
      state: { phase: "open", streak: 0, openTicks: 0 },
      transition: "open",
    };
  }
  return { state: { ...state, streak } };
}

/** " at 21.1s" for a log line released after the tick it happened on (T-12.2); "" otherwise. */
export function logTimeSuffix(atSec?: number): string {
  return atSec === undefined ? "" : ` at ${atSec.toFixed(1)}s`;
}

/** `at` = "" or " at 21.1s"; only a closed line is ever held and released late (T-12.2). */
const breakerMessage: Record<
  BreakerPhase,
  (path: string, failPct: number, at: string) => string
> = {
  open: (path, pct) => `${path} breaker open at ${pct}% errors — failing fast`,
  "half-open": (path) => `${path} breaker half-open — probing`,
  closed: (path, _pct, at) => `${path} breaker closed${at} — traffic restored`,
};

/**
 * Log line for a breaker transition; path = "Source → Target" node labels.
 * `atSec` stamps a closed line the log releases after its tick (T-12.2).
 */
export function breakerEvent(
  sourceLabel: string,
  targetLabel: string,
  to: BreakerPhase,
  failRate = 0,
  atSec?: number,
): string {
  return breakerMessage[to](
    `${sourceLabel} → ${targetLabel}`,
    Math.round(failRate * 100),
    logTimeSuffix(atSec),
  );
}

/** A breaker that re-trips within this long of closing logs one "re-opened" line instead of closed → … → open (T-12.2). */
export const REOPEN_WINDOW_SEC = 1;

/** Could a closed breaker still trip within the next `ticksLeft` ticks? (needs tripTicks − streak more ticks over threshold) */
export function canReopenWithin(
  state: BreakerState,
  cfg: ResolvedBreaker,
  ticksLeft: number,
): boolean {
  return state.phase === "closed" && ticksLeft >= cfg.tripTicks - state.streak;
}

/** The one line for a breaker that re-opened `afterSec` after closing: "App → DB breaker re-opened 0.5 s after closing". */
export function breakerReopenedEvent(
  sourceLabel: string,
  targetLabel: string,
  afterSec: number,
): string {
  return `${sourceLabel} → ${targetLabel} breaker re-opened ${Math.round(afterSec * 10) / 10} s after closing`;
}
