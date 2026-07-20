import type { DesignGraph } from "./design";

export type NodeState = "ok" | "hot" | "saturated" | "overloaded" | "down";

/** One per tick (100ms), streamed worker → UI. */
export interface SimFrame {
  t: number;
  perNode: Record<
    string,
    { util: number; queued: number; dropped: number; state: NodeState }
  >;
  perEdge: Record<string, { rps: number }>;
  p95Ms: number;
  errorRate: number;
  servedRps: number;
  /** log lines emitted this tick */
  events: string[];
}

/** One broken pass criterion. */
export interface VerdictFailure {
  /** which check broke: "p95" | "error-rate" | "kill-survival" | "consistency" */
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
