import type { DesignGraph } from "./design";

export type NodeState = "ok" | "hot" | "saturated" | "overloaded" | "down";

export type BreakerPhase = "closed" | "open" | "half-open";

/** One node's metrics for one tick. */
export interface NodeFrame {
  util: number;
  /** carried backlog in RPS units (re-enters demand next tick); ÷ TICKS_PER_SEC = messages */
  queued: number;
  dropped: number;
  state: NodeState;
  /** async-category nodes only: backlog in messages */
  queueDepth?: number;
  /** async-category nodes only: consumer lag, seconds (depth ÷ drain rate) */
  lagSec?: number;
}

/** One edge's metrics for one tick. */
export interface EdgeFrame {
  /** attempts carried this tick: fresh calls + retries */
  rps: number;
  /** T-8.5, edges with timeoutMs/retries only: retries re-offered this tick (included in rps) */
  retryRps?: number;
  /** T-8.5, same edges only: share of this tick's attempts that failed (shed by the target or timed out) */
  failRate?: number;
  /** phase that governed this tick's traffic; only on edges with a breaker (T-8.6) */
  breaker?: BreakerPhase;
  /** T-12.1, breaker edges only, ticks the breaker rejected calls (open/half-open): RPS failed fast at the caller (already inside the source's `dropped`) */
  failedFastRps?: number;
}

/** One per tick (100ms), streamed worker → UI. */
export interface SimFrame {
  t: number;
  perNode: Record<string, NodeFrame>;
  perEdge: Record<string, EdgeFrame>;
  p95Ms: number;
  /**
   * T-12.5: node id → ms of p95Ms that node accounts for: its share of the
   * path mean plus its share of the 2σ tail by variance contribution (spread
   * from fractional calls / LB mixtures goes to the call's target). Sums to
   * p95Ms up to 0.01 ms rounding per entry; zero entries omitted; absent when
   * nothing is positive (no entry). Frames from older bundles lack it.
   */
  p95ByNode?: Record<string, number>;
  /** client-path drops / offered (0–1); async losses are in asyncDroppedRps */
  errorRate: number;
  servedRps: number;
  /**
   * RPS lost off the client path this tick: async-node backlog overflow,
   * drops at consumers, and the non-client share of shared nodes' drops.
   * Never part of errorRate.
   */
  asyncDroppedRps: number;
  /** max consumer lag (s) over async nodes this tick; 0 with no async nodes */
  maxLagSec: number;
  /** log lines emitted this tick */
  events: string[];
}

/** One broken pass criterion. */
export interface VerdictFailure {
  /** which check broke: "p95" | "error-rate" | "kill-survival" | "consistency" | "lag" */
  criterion: string;
  /** seconds into the run; 0 for static checks */
  atSec: number;
  detail: string;
}

/** A circuit breaker on the client's sync path that failed calls fast during the run (T-12.1). */
export interface BreakerTrip {
  edgeId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  /** calls the breaker rejected over the run (Σ failedFastRps ÷ ticks/s) */
  failedFast: number;
  /** t of the first frame of the final all-closed stretch; null = not closed at the end */
  recoveredAtSec: number | null;
}

/** Evaluated over the whole run (03-simulation-engine "Verdict"). */
export interface Verdict {
  passed: boolean;
  failures: VerdictFailure[];
  /** don't fail the run — shown to the grader */
  advisories: string[];
  /** present only when non-empty; most failed-fast first */
  breakerTrips?: BreakerTrip[];
}

export interface RunResult {
  scenarioId: string;
  designSnapshot: DesignGraph;
  /** full replay */
  frames: SimFrame[];
  verdict: Verdict;
}
