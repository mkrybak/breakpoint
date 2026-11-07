import type {
  ComponentDef,
  ComponentKind,
  DesignEdge,
  DesignGraph,
  DesignNode,
  Scenario,
  SimFrame,
} from "@/lib/core";
import { getComponentDef, isSplitSource } from "@/lib/registry";
// ./node-models imports ./engine back (Flow + config helpers). The cycle is
// init-safe: neither module reads the other's bindings until a function runs.
import {
  callLatencyMs,
  consumerHeadroomRps,
  consumerLagSec,
  getCapacityFn,
  getNodeModel,
  transitionEvent,
  type LoggedState,
  type NodeModelOutput,
} from "./node-models";
import { mulberry32, type Rng } from "./rng";
import {
  beginBreakerTick,
  breakerEvent,
  breakerReopenedEvent,
  canReopenWithin,
  CLOSED_BREAKER,
  endBreakerTick,
  REOPEN_WINDOW_SEC,
  resolveBreaker,
  type BreakerState,
  type ResolvedBreaker,
} from "./breaker";
import {
  buildEdgePolicies,
  initialEdgeState,
  pendingRetries,
  stepEdge,
  type EdgePolicy,
  type EdgeState,
  type EdgeTick,
} from "./edge-state";

/**
 * Traffic is tracked as a read/write pair end-to-end: the cache split absorbs
 * reads only (write-through), and db_sql's capacity model (T-2.3) needs the
 * write fraction separately.
 */
export interface Flow {
  read: number;
  write: number;
}

export function zeroFlow(): Flow {
  return { read: 0, write: 0 };
}

export function addFlow(a: Flow, b: Flow): Flow {
  return { read: a.read + b.read, write: a.write + b.write };
}

export function scaleFlow(f: Flow, k: number): Flow {
  return { read: f.read * k, write: f.write * k };
}

/** Total requests/s in a flow. */
export function flowRps(f: Flow): number {
  return f.read + f.write;
}

/**
 * Split offered RPS into read/write. write = total - read (not
 * total × (1 - ratio)) so read + write === total exactly despite float
 * rounding.
 */
export function splitFlow(totalRps: number, readRatio: number): Flow {
  const read = totalRps * readRatio;
  return { read, write: totalRps - read };
}

/**
 * Resolve a numeric config value: the node's config wins when it is a finite
 * number (clamped to the field's declared range), else the registry default.
 * Keys the def does not declare resolve to `fallback` — junk config can never
 * activate behavior the registry doesn't declare.
 */
export function configNumber(
  node: DesignNode,
  def: ComponentDef,
  key: string,
  fallback = 0,
): number {
  const field = def.configFields.find((f) => f.key === key);
  if (!field || field.type !== "number") return fallback;
  const raw = node.config[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.min(field.max, Math.max(field.min, raw));
  }
  return field.default;
}

/**
 * Resolve a boolean config value: the node's config wins when it is a
 * boolean, else the registry default. Keys the def does not declare resolve
 * to false — junk config can never activate behavior the registry doesn't
 * declare.
 */
export function configBoolean(
  node: DesignNode,
  def: ComponentDef,
  key: string,
): boolean {
  const field = def.configFields.find((f) => f.key === key);
  if (!field || field.type !== "boolean") return false;
  const raw = node.config[key];
  return typeof raw === "boolean" ? raw : field.default;
}

/**
 * Resolve a select config value: the node's config wins when it is one of
 * the field's declared options, else the registry default. Keys the def
 * does not declare resolve to "" — junk config can never activate behavior
 * the registry doesn't declare.
 */
export function configSelect(
  node: DesignNode,
  def: ComponentDef,
  key: string,
): string {
  const field = def.configFields.find((f) => f.key === key);
  if (!field || field.type !== "select") return "";
  const raw = node.config[key];
  return typeof raw === "string" && field.options.includes(raw)
    ? raw
    : field.default;
}

/**
 * Topological order of the nodes reachable from the entry. Deterministic:
 * ties (and cycle stalls) resolve by graph.nodes array order. Self-loops and
 * edges into the entry are ignored — traffic starts at the entry, and
 * validation owns flagging cycles. The engine stays total on any input.
 */
export function topoSort(graph: DesignGraph): string[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  if (!nodeIds.has(graph.entryNodeId)) return [];

  const edges = graph.edges.filter(
    (e) =>
      e.source !== e.target &&
      e.target !== graph.entryNodeId &&
      nodeIds.has(e.source) &&
      nodeIds.has(e.target),
  );
  const outbound = new Map<string, DesignEdge[]>(
    graph.nodes.map((n) => [n.id, []]),
  );
  for (const e of edges) outbound.get(e.source)?.push(e);

  const reachable = new Set<string>([graph.entryNodeId]);
  const frontier = [graph.entryNodeId];
  for (let i = 0; i < frontier.length; i++) {
    for (const e of outbound.get(frontier[i]) ?? []) {
      if (!reachable.has(e.target)) {
        reachable.add(e.target);
        frontier.push(e.target);
      }
    }
  }

  const inDegree = new Map<string, number>();
  for (const id of reachable) inDegree.set(id, 0);
  for (const e of edges) {
    if (reachable.has(e.source) && reachable.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < reachable.size) {
    let next: string | undefined;
    let fallback: string | undefined;
    for (const node of graph.nodes) {
      if (!reachable.has(node.id) || done.has(node.id)) continue;
      fallback ??= node.id;
      if (inDegree.get(node.id) === 0) {
        next = node.id;
        break;
      }
    }
    const id = next ?? fallback; // no zero-in-degree node left = cycle; break it
    if (id === undefined) break;
    done.add(id);
    order.push(id);
    for (const e of outbound.get(id) ?? []) {
      if (reachable.has(e.target) && !done.has(e.target)) {
        inDegree.set(e.target, (inDegree.get(e.target) ?? 0) - 1);
      }
    }
  }
  return order;
}

export interface NodeTraffic {
  /** sync inbound arriving this tick — the client-latency path */
  demand: Flow;
  /** arrivals via async edges — queue semantics, off the sync latency path (wait shows as the queue's lagSec) */
  asyncArrivals: Flow;
}

export interface PropagationResult {
  /** reachable nodes, in the topological order traffic was propagated */
  order: string[];
  /** every node id appears; unreachable nodes carry zero flows */
  perNode: Record<string, NodeTraffic>;
  /** every edge id appears; edges off any reachable path carry zero */
  perEdge: Record<string, Flow>;
  /** flow each edge's source sent before retries; zero on dead/unused edges, === perEdge's value when no retry rode along */
  freshPerEdge: Record<string, Flow>;
  /** flow a dead (partitioned) edge stranded at its source, per node id */
  unroutable: Record<string, Flow>;
  /** edge id → RPS a breaker gate rejected at the source this tick; only gated (edgePass < 1) live edges */
  failedFastPerEdge: Record<string, number>;
}

/**
 * Per-tick rule effects propagation must honor (T-2.5).
 */
export interface PropagationOverrides {
  /** node id → forced cache hit rate; beats the node's config */
  hitRate?: Record<string, number>;
  /** edge ids carrying no traffic this tick */
  deadEdges?: readonly string[];
  /** edge id → retry flow re-offered on top of the edge's fresh flow this tick (T-8.5) */
  retryFlow?: Record<string, Flow>;
  /** edge id → fraction of the edge's flow admitted this tick (circuit breaker, T-8.6); absent = 1 */
  edgePass?: Record<string, number>;
}

/** T-2.3 plugs the capacity model in here; default = serve everything. */
export type ServeFn = (
  node: DesignNode,
  def: ComponentDef,
  inflow: Flow,
) => Flow;

const serveAll: ServeFn = (_node, _def, inflow) => inflow;

/**
 * How much of a node's forwarded flow one outbound edge carries (T-8.3):
 * split source (lb) → trafficShare, a fraction of a whole that sums to 1;
 * any other source → callsPerRequest, calls per request served (fractional
 * or > 1). Absent field = 1. Both multiply, so legacy shares migrate 1:1.
 */
export function edgeMultiplier(edge: DesignEdge, sourceKind: ComponentKind): number {
  return isSplitSource(sourceKind)
    ? (edge.trafficShare ?? 1)
    : (edge.callsPerRequest ?? 1);
}

/**
 * One propagation pass (tick-loop step 2): push `offered` from the entry node
 * through the graph in topological order. Per node: inflow = sync demand +
 * async arrivals → serve → absorb read hits (hitRate) → forward the rest
 * along outbound edges × edgeMultiplier (split share or calls per request).
 * missed = read − read × hitRate keeps
 * hits + misses === reads exact.
 *
 * Flow aimed at a dead (partitioned) edge is booked in `unroutable` at the
 * source — the tick loop counts it as dropped there. A breaker's `edgePass`
 * admits only that fraction; the rest books in `unroutable` at the source
 * (fails fast as a caller error, like a partition), and is also reported
 * per edge in `failedFastPerEdge`.
 */
export function propagateTraffic(
  graph: DesignGraph,
  offered: Flow,
  serve: ServeFn = serveAll,
  overrides: PropagationOverrides = {},
): PropagationResult {
  const order = topoSort(graph);
  const perNode: Record<string, NodeTraffic> = {};
  const unroutable: Record<string, Flow> = {};
  for (const n of graph.nodes) {
    perNode[n.id] = { demand: zeroFlow(), asyncArrivals: zeroFlow() };
    unroutable[n.id] = zeroFlow();
  }
  const perEdge: Record<string, Flow> = {};
  const freshPerEdge: Record<string, Flow> = {};
  const failedFastPerEdge: Record<string, number> = {};
  for (const e of graph.edges) {
    perEdge[e.id] = zeroFlow();
    freshPerEdge[e.id] = zeroFlow();
  }
  if (order.length === 0) {
    return { order, perNode, perEdge, freshPerEdge, unroutable, failedFastPerEdge };
  }
  const dead = new Set(overrides.deadEdges ?? []);

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const position = new Map(order.map((id, i) => [id, i]));
  perNode[graph.entryNodeId].demand = { ...offered };

  for (const id of order) {
    const node = nodeById.get(id);
    if (!node) continue;
    const def = getComponentDef(node.kind);
    const traffic = perNode[id];
    const served = serve(node, def, addFlow(traffic.demand, traffic.asyncArrivals));
    const hitRate = overrides.hitRate?.[id] ?? configNumber(node, def, "hitRate");
    const forwarded: Flow = {
      read: served.read - served.read * hitRate,
      write: served.write,
    };
    for (const edge of graph.edges) {
      if (edge.source !== id) continue;
      const to = position.get(edge.target);
      // back/self edges (cycles) and edges into the entry carry nothing
      if (to === undefined || to <= (position.get(id) ?? 0)) continue;
      let fresh = scaleFlow(forwarded, edgeMultiplier(edge, node.kind));
      const retry = overrides.retryFlow?.[edge.id];
      let flow = retry ? addFlow(fresh, retry) : fresh;
      if (dead.has(edge.id)) {
        unroutable[id] = addFlow(unroutable[id], flow);
        continue;
      }
      const pass = overrides.edgePass?.[edge.id] ?? 1;
      if (pass < 1) {
        const admitted = scaleFlow(flow, pass);
        unroutable[id] = addFlow(unroutable[id], {
          read: flow.read - admitted.read,
          write: flow.write - admitted.write,
        });
        failedFastPerEdge[edge.id] = flowRps(flow) - flowRps(admitted);
        flow = admitted;
        // latency weights come from fresh flow: an open edge charges 0 ms
        fresh = scaleFlow(fresh, pass);
      }
      perEdge[edge.id] = flow;
      freshPerEdge[edge.id] = fresh;
      const target = perNode[edge.target];
      if (edge.kind === "async") {
        target.asyncArrivals = addFlow(target.asyncArrivals, flow);
      } else {
        target.demand = addFlow(target.demand, flow);
      }
    }
  }
  return { order, perNode, perEdge, freshPerEdge, unroutable, failedFastPerEdge };
}

/**
 * Fraction of each node's traffic this tick that is on the client (sync)
 * path (T-8.2). Entry = 1; async-category nodes = 0 (work they accepted is
 * off the client path, and so is everything downstream of them); others =
 * client-carried in-edge flow / total in-edge flow, where only sync edges
 * carry the source's share. Zero-inflow nodes keep `prev` (initially 0):
 * their remaining backlog came from earlier ticks. Every graph node gets
 * an entry.
 */
export function clientShares(
  graph: DesignGraph,
  prop: PropagationResult,
  prev: ReadonlyMap<string, number>,
): Map<string, number> {
  const share = new Map<string, number>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const inflow = new Map<string, { total: number; client: number }>();
  for (const id of prop.order) {
    const node = nodeById.get(id);
    if (!node) continue;
    let s: number;
    if (getComponentDef(node.kind).category === "async") s = 0;
    else if (id === graph.entryNodeId) s = 1;
    else {
      const acc = inflow.get(id);
      s = acc && acc.total > 0 ? acc.client / acc.total : (prev.get(id) ?? 0);
    }
    share.set(id, s);
    for (const edge of graph.edges) {
      if (edge.source !== id) continue;
      const rps = flowRps(prop.perEdge[edge.id]);
      if (rps === 0) continue;
      const acc = inflow.get(edge.target) ?? { total: 0, client: 0 };
      acc.total += rps;
      if (edge.kind === "sync") acc.client += rps * s;
      inflow.set(edge.target, acc);
    }
  }
  for (const n of graph.nodes) {
    if (!share.has(n.id)) share.set(n.id, prev.get(n.id) ?? 0);
  }
  return share;
}

/** Simulation clock: 10 ticks/s (dt = 100 ms). */
export const TICKS_PER_SEC = 10;

/**
 * p95 ≈ mean + P95_SIGMAS × σ of the client path. 2σ reproduces an
 * exponential's p95 (ln 20 ≈ 3.0 × mean) for a single M/M/1 hop.
 */
const P95_SIGMAS = 2;

/** Mean and variance of a request's time from a node to the end of its sync path. */
export interface PathMoments {
  meanMs: number;
  varianceMs2: number;
}

/**
 * What the scenario timeline does to one tick. T-2.5's stress rules compile
 * the timeline into these; until then the default is steady base load.
 */
export interface TickEffects {
  /** offered load at the entry this tick, before the read/write split */
  offeredRps: number;
  /**
   * node id → capacity multiplier; absent = 1 (healthy). kill writes the
   * surviving fraction here, hotkey its imbalance penalty — they compose ×.
   */
  aliveFraction?: Record<string, number>;
  /** node id → forced cache hit rate (flush rule); beats the node's config */
  hitRate?: Record<string, number>;
  /** edge ids carrying no traffic this tick (partition rule) */
  deadEdges?: string[];
}

export type ApplyRulesFn = (
  tickIndex: number,
  scenario: Scenario,
  rng: Rng,
) => TickEffects;

const steadyBaseLoad: ApplyRulesFn = (_tickIndex, scenario) => ({
  offeredRps: scenario.baseRps,
});

/** One sync child on a node's client path. */
export interface PathTerm {
  target: string;
  /**
   * Share of the source's requests that pay the target's path latency.
   * call (non-LB source): flow(e) / served(source) = callsPerRequest ×
   *   pass-through (a cache passes only misses + writes) — calls ADD.
   * split (LB source): flow(e) / Σ flow over its forward sync edges —
   *   backends AVERAGE over live edges.
   * Computed from fresh flows, so retries never change it (T-8.5).
   */
  weight: number;
  /** expected attempts per call this tick: attempts / fresh on the edge (1 without retries) */
  attempts: number;
  /** the edge's timeout, if any */
  timeoutMs?: number;
}

/**
 * Client-path weights per reachable node (tick-loop step 4), separate from
 * the fold so tail models (T-8.7) reuse them. Sync forward edges only, in
 * graph.edges order; dead edges stay with weight 0 (flow 0). Weights are
 * flow-derived, never edge.callsPerRequest, so cache hits never pay the DB.
 */
export function clientPathTerms(
  graph: DesignGraph,
  prop: PropagationResult,
  outputs: ReadonlyMap<string, NodeModelOutput>,
  policies: ReadonlyMap<string, EdgePolicy> = new Map(),
): Map<string, PathTerm[]> {
  const position = new Map(prop.order.map((id, i) => [id, i]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const terms = new Map<string, PathTerm[]>();
  prop.order.forEach((id, i) => {
    const node = nodeById.get(id);
    const out = outputs.get(id);
    if (!node || !out) return;
    // T-8.2 (lead): consumers pull from a queue/stream, so nothing past an async node is on the client path
    const asyncSource = getComponentDef(node.kind).category === "async";
    const edges = graph.edges.filter((edge) => {
      if (asyncSource || edge.source !== id || edge.kind === "async") return false;
      const to = position.get(edge.target);
      return to !== undefined && to > i;
    });
    const flows = edges.map((edge) => flowRps(prop.freshPerEdge[edge.id]));
    const denominator = isSplitSource(node.kind)
      ? flows.reduce((sum, f) => sum + f, 0)
      : flowRps(out.served);
    terms.set(
      id,
      edges.map((edge, k) => {
        const policy = policies.get(edge.id);
        return {
          target: edge.target,
          weight: denominator > 0 ? flows[k] / denominator : 0,
          attempts:
            policy && flows[k] > 0
              ? flowRps(prop.perEdge[edge.id]) / flows[k]
              : 1,
          ...(policy?.timeoutMs !== undefined
            ? { timeoutMs: policy.timeoutMs }
            : {}),
        };
      }),
    );
  });
  return terms;
}

/**
 * Latency one term charges per unit weight, given its target's mean path:
 * attempts × E[min(T, timeout)] (T-8.5). The single per-term transform;
 * T-8.7 treats it as a scale/cap.
 */
export function termMs(term: PathTerm, targetMs: number): number {
  return term.attempts * callLatencyMs(targetMs, term.timeoutMs);
}

/**
 * Mean and variance of client-visible latency per reachable node (tick-loop
 * step 4), folded in reverse topo order over clientPathTerms. Node n
 * contributes its own latencyMs / latencyVarMs2. Each term charges its
 * target's moments through termMs (m' = termMs(term, m)), treated as a
 * scale/cap: v' = v × (m'/m)². Calls add (sequential, independent hops:
 * variances add; a fractional weight w is ⌊w⌋ or ⌈w⌉ calls, adding
 * f(1−f)·m'² spread, f = w − ⌊w⌋). An LB split is a mixture: variance +=
 * Σw(v'+m'²) − (Σw·m')². The mean fold is T-8.5's, term for term in the same
 * order; async/dead edges add nothing.
 */
export function pathMomentsMap(
  graph: DesignGraph,
  prop: PropagationResult,
  outputs: ReadonlyMap<string, NodeModelOutput>,
  policies: ReadonlyMap<string, EdgePolicy> = new Map(),
): Map<string, PathMoments> {
  const terms = clientPathTerms(graph, prop, outputs, policies);
  const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const moments = new Map<string, PathMoments>();
  for (let i = prop.order.length - 1; i >= 0; i--) {
    const id = prop.order[i];
    const out = outputs.get(id);
    if (!out) continue;
    const split = isSplitSource(kindById.get(id));
    let meanMs = out.latencyMs;
    let varianceMs2 = out.latencyVarMs2;
    let mixMean = 0; // split only: Σ w·m'
    let mixSecond = 0; // split only: Σ w·(v' + m'²)
    for (const term of terms.get(id) ?? []) {
      const w = term.weight;
      const t = moments.get(term.target) ?? { meanMs: 0, varianceMs2: 0 };
      const m = termMs(term, t.meanMs);
      const v = t.meanMs > 0 ? t.varianceMs2 * (m / t.meanMs) ** 2 : 0;
      meanMs += w * m;
      if (split) {
        mixMean += w * m;
        mixSecond += w * (v + m * m);
      } else {
        const f = w - Math.floor(w);
        varianceMs2 += w * v + f * (1 - f) * m * m;
      }
    }
    if (split) varianceMs2 += Math.max(0, mixSecond - mixMean * mixMean); // float guard
    moments.set(id, { meanMs, varianceMs2 });
  }
  return moments;
}

/** The entry's path moments: pathMomentsMap at graph.entryNodeId; zero moments without an entry. */
export function pathMoments(
  graph: DesignGraph,
  prop: PropagationResult,
  outputs: ReadonlyMap<string, NodeModelOutput>,
  policies: ReadonlyMap<string, EdgePolicy> = new Map(),
): PathMoments {
  return (
    pathMomentsMap(graph, prop, outputs, policies).get(graph.entryNodeId) ?? {
      meanMs: 0,
      varianceMs2: 0,
    }
  );
}

/** p95 ≈ mean + 2σ. */
export function p95FromMoments({ meanMs, varianceMs2 }: PathMoments): number {
  return meanMs + P95_SIGMAS * Math.sqrt(varianceMs2);
}

/** A stepping simulation: per-run state lives in the closure. */
export interface SimRun {
  /** Advance one tick and return its frame; null once the run is complete. */
  tick(): SimFrame | null;
}

/**
 * Incremental form of the tick loop (03-simulation-engine): rules →
 * propagate → node models → latency → frame, one tick per call. Total on any
 * input and pure: the only randomness is mulberry32(scenario.seed) handed to
 * `applyRules`, so the same (graph, scenario, seed) always yields
 * byte-identical frames. Policy edges (timeouts/retries, T-8.5) carry
 * EdgeState tick-to-tick, breaker edges a BreakerState (T-8.6); no RNG, so
 * determinism holds. simulate() drains it
 * in one go; the worker paces it in real time. The event log reports
 * breaker-shadowed ok nodes as idle and holds a closed breaker's lines until
 * it can't re-open within REOPEN_WINDOW_SEC (T-12.2); frames other than
 * `events` are unaffected.
 */
export function createSimRun(
  graph: DesignGraph,
  scenario: Scenario,
  applyRules: ApplyRulesFn = steadyBaseLoad,
): SimRun {
  const rng = mulberry32(scenario.seed);
  const tickCount = Math.max(
    0,
    Math.round(scenario.durationSec * TICKS_PER_SEC),
  );
  const queuedPrev = new Map<string, Flow>(
    graph.nodes.map((n) => [n.id, zeroFlow()]),
  );
  /** what the event log last said about each node (T-12.2) */
  const logged = new Map<string, LoggedState>(
    graph.nodes.map((n) => [n.id, "ok"]),
  );
  const prevLag = new Map<string, number>();
  const clientSharePrev = new Map<string, number>();
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const order = topoSort(graph);
  const position = new Map(order.map((id, i) => [id, i]));
  /** async node id → its forward outbound edges (the consumers that pull) */
  const consumers = new Map<string, DesignEdge[]>();
  /** node id → its forward inbound edges */
  const forwardIn = new Map<string, DesignEdge[]>();
  for (const e of graph.edges) {
    const from = position.get(e.source);
    const to = position.get(e.target);
    const src = nodeById.get(e.source);
    if (from === undefined || to === undefined || to <= from || !src) continue;
    forwardIn.set(e.target, [...(forwardIn.get(e.target) ?? []), e]);
    if (getComponentDef(src.kind).category !== "async") continue;
    consumers.set(e.source, [...(consumers.get(e.source) ?? []), e]);
  }
  const policies = buildEdgePolicies(graph);
  const edgeStates = new Map<string, EdgeState>(
    [...policies].map(([id, policy]) => [id, initialEdgeState(policy)]),
  );
  // T-8.6: breakers on edges that support resilience (all have a policy, so failRate exists)
  const breakers = new Map<
    string,
    { edge: DesignEdge; cfg: ResolvedBreaker; state: BreakerState }
  >();
  for (const edge of graph.edges) {
    const cfg = resolveBreaker(edge, TICKS_PER_SEC);
    if (cfg && policies.has(edge.id)) {
      breakers.set(edge.id, { edge, cfg, state: CLOSED_BREAKER });
    }
  }
  const breakerLine = (
    edge: DesignEdge,
    to: BreakerState["phase"],
    rate?: number,
    atSec?: number,
  ): string =>
    breakerEvent(
      nodeById.get(edge.source)?.label ?? edge.source,
      nodeById.get(edge.target)?.label ?? edge.target,
      to,
      rate,
      atSec,
    );
  /** nodes whose every forward inbound edge is gated or comes from such a node */
  const shadowOf = (gated: ReadonlySet<string>): Set<string> => {
    const shadow = new Set<string>();
    if (gated.size === 0) return shadow;
    for (const id of order) {
      const ins = forwardIn.get(id) ?? [];
      if (
        ins.length > 0 &&
        ins.every((e) => gated.has(e.id) || shadow.has(e.source))
      ) {
        shadow.add(id);
      }
    }
    return shadow;
  };
  /** breaker edge id → the nodes whose whole load runs through it */
  const behind = new Map(
    [...breakers.keys()].map((id) => [id, shadowOf(new Set([id]))]),
  );
  /** a held log line: the tick it happened on, and its text (stamped with that time if released later) */
  type HeldLine = { tick: number; render: (atSec?: number) => string };
  /** breaker edge id → lines held after it closed, until it can no longer re-open within REOPEN_WINDOW_SEC */
  const holds = new Map<
    string,
    { sinceTick: number; lines: HeldLine[]; restore: Map<string, LoggedState> }
  >();
  const reopenWindowTicks = Math.round(REOPEN_WINDOW_SEC * TICKS_PER_SEC);
  let tickIndex = 0;

  return {
    tick(): SimFrame | null {
      if (tickIndex >= tickCount) return null;
      const tick = tickIndex;
      tickIndex += 1;

      const effects = applyRules(tick, scenario, rng);
      const dead = new Set(effects.deadEdges ?? []);
      /** pull semantics: what an async node's consumers can take this tick */
      const pullRps = (id: string, mix: Flow): number => {
        const src = nodeById.get(id);
        if (!src) return Infinity; // no node → no consumers registered
        let limit = Infinity;
        for (const e of consumers.get(id) ?? []) {
          const m = edgeMultiplier(e, src.kind);
          if (m <= 0) continue;
          if (dead.has(e.id)) return 0; // nobody pulls over a cut link
          const target = nodeById.get(e.target);
          if (!target) continue;
          const tdef = getComponentDef(target.kind);
          const cap = getCapacityFn(target.kind)(
            target,
            tdef,
            effects.aliveFraction?.[target.id] ?? 1,
          );
          const backlog =
            tdef.category === "async"
              ? zeroFlow()
              : (queuedPrev.get(target.id) ?? zeroFlow());
          limit = Math.min(
            limit,
            consumerHeadroomRps(cap, backlog, mix) / m,
          );
        }
        return limit;
      };
      const outputs = new Map<string, NodeModelOutput>();
      const evaluate = (
        node: DesignNode,
        def: ComponentDef,
        inflow: Flow,
      ): NodeModelOutput => {
        const backlog = queuedPrev.get(node.id) ?? zeroFlow();
        const out = getNodeModel(node.kind)({
          node,
          def,
          inflow,
          queuedPrev: backlog,
          aliveFraction: effects.aliveFraction?.[node.id] ?? 1,
          ...(def.category === "async"
            ? { drainRps: pullRps(node.id, addFlow(inflow, backlog)) }
            : {}),
        });
        outputs.set(node.id, out);
        return out;
      };
      const retryFlow: Record<string, Flow> = {};
      for (const [id, state] of edgeStates) {
        const retry = pendingRetries(state);
        if (flowRps(retry) > 0) retryFlow[id] = retry;
      }
      const edgePass: Record<string, number> = {};
      const tickPhase = new Map<string, BreakerState["phase"]>();
      const events: string[] = [];
      const gated = new Set<string>();
      for (const [id, b] of breakers) {
        const begun = beginBreakerTick(b.state, b.cfg);
        b.state = begun.state;
        tickPhase.set(id, begun.state.phase);
        if (begun.pass < 1) {
          edgePass[id] = begun.pass;
          gated.add(id);
        }
        if (begun.halfOpened) events.push(breakerLine(b.edge, "half-open"));
      }
      const shadow = shadowOf(gated);
      const prop = propagateTraffic(
        graph,
        splitFlow(effects.offeredRps, scenario.readRatio),
        (node, def, inflow) => evaluate(node, def, inflow).served,
        {
          hitRate: effects.hitRate,
          deadEdges: effects.deadEdges,
          retryFlow,
          edgePass,
        },
      );
      const shares = clientShares(graph, prop, clientSharePrev);

      const perNode: SimFrame["perNode"] = {};
      let clientDropped = 0;
      let asyncDropped = 0;
      let maxLagSec = 0;
      for (const node of graph.nodes) {
        // nodes propagation never reached still tick, so backlogs drain/drop
        const out =
          outputs.get(node.id) ??
          evaluate(node, getComponentDef(node.kind), zeroFlow());
        const lost = flowRps(prop.unroutable[node.id]);
        const nodeDropped = out.dropped + lost;
        const share = shares.get(node.id) ?? 0;
        const clientLost = nodeDropped * share;
        clientDropped += clientLost;
        asyncDropped += nodeDropped - clientLost;
        clientSharePrev.set(node.id, share);
        perNode[node.id] = {
          util: out.util,
          queued: flowRps(out.queued),
          dropped: out.dropped + lost,
          state: out.state,
        };
        if (getComponentDef(node.kind).category === "async") {
          const depth = flowRps(out.queued) / TICKS_PER_SEC;
          const lag = consumerLagSec(
            depth,
            flowRps(out.served),
            prevLag.get(node.id) ?? 0,
          );
          prevLag.set(node.id, lag);
          perNode[node.id].queueDepth = depth;
          perNode[node.id].lagSec = lag;
        }
        maxLagSec = Math.max(maxLagSec, perNode[node.id].lagSec ?? 0);
        queuedPrev.set(node.id, out.queued);
        const shown: LoggedState =
          out.state === "ok" && shadow.has(node.id) ? "idle" : out.state;
        const was = logged.get(node.id) ?? "ok";
        if (shown !== was) {
          logged.set(node.id, shown);
          const servedRps = flowRps(out.served);
          const render = (atSec?: number) =>
            transitionEvent(node.label, shown, servedRps, atSec);
          const hold = [...holds].find(([id]) =>
            behind.get(id)?.has(node.id),
          )?.[1];
          if (hold) {
            if (!hold.restore.has(node.id)) hold.restore.set(node.id, was);
            hold.lines.push({ tick, render });
          } else {
            events.push(render());
          }
        }
      }

      const pathMs = pathMomentsMap(graph, prop, outputs, policies);
      const edgeTicks = new Map<string, EdgeTick>();
      for (const edge of graph.edges) {
        const policy = policies.get(edge.id);
        const state = edgeStates.get(edge.id);
        if (!policy || !state) continue;
        const step = stepEdge(policy, state, {
          fresh: prop.freshPerEdge[edge.id],
          dead: dead.has(edge.id),
          rejectFraction: outputs.get(edge.target)?.rejectFraction ?? 0,
          targetPathMs: pathMs.get(edge.target)?.meanMs ?? 0,
          admit: edgePass[edge.id] ?? 1,
        });
        edgeStates.set(edge.id, step.next);
        edgeTicks.set(edge.id, step);
        // retried drops are not errors yet; given-up timeouts are (T-8.5)
        const adjust = step.exhaustedRps - step.rejectedRps;
        const share = shares.get(edge.source) ?? 0;
        clientDropped += adjust * share;
        asyncDropped += adjust - adjust * share;
      }
      clientDropped = Math.max(0, clientDropped);
      asyncDropped = Math.max(0, asyncDropped);

      // T-8.6: fold this tick's failure rate (admitted calls only) into each breaker
      for (const [id, b] of breakers) {
        const failRate = edgeTicks.get(id)?.failRate ?? 0;
        const ended = endBreakerTick(b.state, b.cfg, failRate);
        b.state = ended.state;
        const held = holds.get(id);
        if (ended.transition === "open" && held) {
          holds.delete(id);
          for (const [nodeId, st] of held.restore) logged.set(nodeId, st);
          events.push(
            breakerReopenedEvent(
              nodeById.get(b.edge.source)?.label ?? b.edge.source,
              nodeById.get(b.edge.target)?.label ?? b.edge.target,
              (tick - held.sinceTick) / TICKS_PER_SEC,
            ),
          );
        } else if (ended.transition === "closed") {
          const edge = b.edge;
          holds.set(id, {
            sinceTick: tick,
            lines: [
              {
                tick,
                render: (atSec) => breakerLine(edge, "closed", 0, atSec),
              },
            ],
            restore: new Map(),
          });
        } else if (ended.transition) {
          events.push(breakerLine(b.edge, ended.transition, failRate));
        }
        const hold = holds.get(id);
        if (
          hold &&
          (tickIndex >= tickCount ||
            !canReopenWithin(
              b.state,
              b.cfg,
              hold.sinceTick + reopenWindowTicks - tick,
            ))
        ) {
          holds.delete(id);
          // a line released after its own tick says when it really happened
          for (const line of hold.lines) {
            events.push(
              line.render(
                line.tick === tick ? undefined : line.tick / TICKS_PER_SEC,
              ),
            );
          }
        }
      }

      const perEdge: SimFrame["perEdge"] = {};
      for (const edge of graph.edges) {
        const rps = flowRps(prop.perEdge[edge.id]);
        const step = edgeTicks.get(edge.id);
        const phase = tickPhase.get(edge.id);
        const failedFast = prop.failedFastPerEdge[edge.id] ?? 0;
        perEdge[edge.id] = {
          rps,
          ...(step ? { retryRps: step.retryRps, failRate: step.failRate } : {}),
          ...(phase !== undefined ? { breaker: phase } : {}),
          ...(failedFast > 0 ? { failedFastRps: failedFast } : {}),
        };
      }

      return {
        t: tick / TICKS_PER_SEC,
        perNode,
        perEdge,
        p95Ms: p95FromMoments(
          pathMs.get(graph.entryNodeId) ?? { meanMs: 0, varianceMs2: 0 },
        ),
        errorRate:
          effects.offeredRps > 0
            ? Math.min(1, clientDropped / effects.offeredRps)
            : clientDropped > 0
              ? 1
              : 0,
        // client-facing: accepted-not-dropped on the client path; queued
        // work counts until it drops. A graph with no entry serves nothing,
        // whatever was offered.
        servedRps:
          prop.order.length === 0
            ? 0
            : Math.max(0, effects.offeredRps - clientDropped),
        asyncDroppedRps: asyncDropped,
        maxLagSec,
        events,
      };
    },
  };
}

/** The full tick loop in one call: every frame of the run. */
export function simulate(
  graph: DesignGraph,
  scenario: Scenario,
  applyRules: ApplyRulesFn = steadyBaseLoad,
): SimFrame[] {
  const run = createSimRun(graph, scenario, applyRules);
  const frames: SimFrame[] = [];
  for (let frame = run.tick(); frame !== null; frame = run.tick()) {
    frames.push(frame);
  }
  return frames;
}
