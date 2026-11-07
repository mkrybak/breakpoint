import type { DesignGraph } from "./design";

export type NodeState = "ok" | "hot" | "saturated" | "overloaded" | "down";

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

/** One per tick (100ms), streamed worker → UI. */
export interface SimFrame {
  t: number;
  perNode: Record<string, NodeFrame>;
  perEdge: Record<string, { rps: number }>;
  p95Ms: number;
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

/** Evaluated over the whole run (03-simulation-engine "Verdict"). */
export interface Verdict {
  passed: boolean;
  failures: VerdictFailure[];
  /** don't fail the run — shown to the grader */
  advisories: string[];
}

export interface RunResult {
  scenarioId: string;
  designSnapshot: DesignGraph;
  /** full replay */
  frames: SimFrame[];
  verdict: Verdict;
}
