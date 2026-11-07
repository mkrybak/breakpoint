import type { ComponentKind } from "./component";

export interface DesignNode {
  id: string;
  kind: ComponentKind;
  /** candidate's name for it */
  label: string;
  position: { x: number; y: number };
  config: Record<string, number | string | boolean>;
}

/** T-8.6: per-edge circuit breaker (sync edges only; ignored on async). */
export interface EdgeBreaker {
  /** 0–1: trips when this edge's call failure rate is strictly above it */
  errorThreshold: number;
  /** consecutive seconds over the threshold before it opens */
  tripAfterSec: number;
  /** seconds it stays open (fail fast) before a half-open probe */
  cooldownSec: number;
}

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  /** async = via queue semantics, no latency on client path */
  kind: "sync" | "async";
  /**
   * Split edges only (source kind splitsTraffic, i.e. an lb): 0–1 fraction of
   * the source's traffic sent down this edge; a split source's shares sum to 1.
   * Absent reads as 1. (T-8.3)
   */
  trafficShare?: number;
  /** Split edges only — T-6.1 auto-balancing; absent === true (auto). */
  autoShare?: boolean;
  /**
   * Call edges only (every other source): calls to the target per request the
   * source serves. Absent reads as 1; fractional (0.2 = 20% of requests enqueue
   * a job) or > 1 (3 queries per request). (T-8.3)
   */
  callsPerRequest?: number;
  /** T-8.5, sync call edges only: ms the caller waits per attempt; absent = no timeout. */
  timeoutMs?: number;
  /** T-8.5, sync call edges only: extra attempts after a failure (0–5); absent = 0. */
  retries?: number;
  /** optional circuit breaker; absent = none (T-8.6) */
  breaker?: EdgeBreaker;
}

export interface DesignGraph {
  nodes: DesignNode[];
  edges: DesignEdge[];
  entryNodeId: string;
}
