/**
 * Per-edge resilience state carried tick-to-tick (T-8.5 timeouts/retries;
 * T-8.6 adds the circuit breaker here). Imports ./engine for Flow helpers;
 * the cycle is init-safe like node-models'.
 */
import type { ComponentKind, DesignEdge, DesignGraph } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import { addFlow, flowRps, scaleFlow, zeroFlow, type Flow } from "./engine";
import { timeoutFraction } from "./node-models";

export const MAX_RETRIES = 5;
export const MAX_TIMEOUT_MS = 60000;

/** Sanitized per-edge settings. T-8.6 adds `breaker?`. */
export interface EdgePolicy {
  timeoutMs?: number;
  retries: number;
}

/**
 * Carried tick-to-tick. retryCarry[k] = flow that failed attempt k+1,
 * re-offered next tick as attempt k+2 (length = retries). T-8.6 adds `breaker`.
 */
export interface EdgeState {
  retryCarry: Flow[];
}

/**
 * Can this edge carry timeouts/retries? Sync, and its source isn't a
 * queue/stream (consumers pull, T-8.1). Shared with the edge inspector.
 */
export function edgeSupportsResilience(
  edge: DesignEdge,
  sourceKind: ComponentKind | undefined,
): boolean {
  return (
    edge.kind === "sync" &&
    sourceKind !== undefined &&
    getComponentDef(sourceKind).category !== "async"
  );
}

/** Sanitize an edge's fields; null = no policy (the edge behaves exactly as before T-8.5). */
export function edgePolicy(edge: DesignEdge): EdgePolicy | null {
  const t = edge.timeoutMs;
  const timeoutMs =
    typeof t === "number" && Number.isFinite(t) && t > 0
      ? Math.min(t, MAX_TIMEOUT_MS)
      : undefined;
  const r = edge.retries;
  const retries =
    typeof r === "number" && Number.isFinite(r)
      ? Math.min(MAX_RETRIES, Math.max(0, Math.round(r)))
      : 0;
  if (timeoutMs === undefined && retries === 0) return null;
  return timeoutMs === undefined ? { retries } : { timeoutMs, retries };
}

/** Policy per edge id, in graph.edges order, for edges that support one. Fixed per run. */
export function buildEdgePolicies(graph: DesignGraph): Map<string, EdgePolicy> {
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const policies = new Map<string, EdgePolicy>();
  for (const edge of graph.edges) {
    if (!edgeSupportsResilience(edge, kindById.get(edge.source))) continue;
    const policy = edgePolicy(edge);
    if (policy) policies.set(edge.id, policy);
  }
  return policies;
}

export function initialEdgeState(policy: EdgePolicy): EdgeState {
  return { retryCarry: Array.from({ length: policy.retries }, zeroFlow) };
}

/** Retries to re-offer this tick: Σ retryCarry. */
export function pendingRetries(state: EdgeState): Flow {
  return state.retryCarry.reduce(addFlow, zeroFlow());
}

export interface EdgeTickInput {
  /** first attempts the source sent this tick (PropagationResult.freshPerEdge) */
  fresh: Flow;
  /** partitioned this tick: propagation booked everything unroutable at the source */
  dead: boolean;
  /** the target's rejectFraction this tick */
  rejectFraction: number;
  /** the target's mean client-path latency this tick (uncapped) */
  targetPathMs: number;
}

export interface EdgeTick {
  next: EdgeState;
  /** retries offered this tick */
  retryRps: number;
  /** share of this tick's attempts that failed; 0 with no attempts, 1 on a dead edge */
  failRate: number;
  /** attempts the target shed (already inside its `dropped`) */
  rejectedRps: number;
  /** failed attempts with no retry left: the caller gives up */
  exhaustedRps: number;
}

/**
 * One tick of an edge's retry bookkeeping. fail = reject + (1 − reject) ×
 * timeoutFraction hits every attempt level alike; level k's failures carry to
 * level k+1; the last level's failures are exhausted.
 */
export function stepEdge(
  policy: EdgePolicy,
  state: EdgeState,
  input: EdgeTickInput,
): EdgeTick {
  const retry = pendingRetries(state);
  const retryRps = flowRps(retry);
  const attemptsRps = flowRps(input.fresh) + retryRps;
  if (input.dead) {
    return {
      next: initialEdgeState(policy),
      retryRps,
      failRate: attemptsRps > 0 ? 1 : 0,
      rejectedRps: 0,
      exhaustedRps: 0,
    };
  }
  const reject = Math.min(1, Math.max(0, input.rejectFraction));
  const timedOut =
    policy.timeoutMs === undefined
      ? 0
      : timeoutFraction(input.targetPathMs, policy.timeoutMs);
  const fail = reject + (1 - reject) * timedOut;
  const levels = [input.fresh, ...state.retryCarry];
  return {
    next: {
      retryCarry: levels
        .slice(0, policy.retries)
        .map((level) => scaleFlow(level, fail)),
    },
    retryRps,
    failRate: attemptsRps > 0 ? fail : 0,
    rejectedRps: attemptsRps * reject,
    exhaustedRps: flowRps(levels[policy.retries]) * fail,
  };
}
