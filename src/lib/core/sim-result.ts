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

export interface RunResult {
  scenarioId: string;
  designSnapshot: DesignGraph;
  /** full replay */
  frames: SimFrame[];
  passed: boolean;
  /** which pass-criteria broke and when */
  failures: string[];
}
