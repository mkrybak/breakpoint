import type {
  ComponentDef,
  DesignEdge,
  DesignGraph,
  DesignNode,
  NodeState,
  Scenario,
  SimFrame,
} from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
// ./node-models imports ./engine back (Flow + config helpers). The cycle is
// init-safe: neither module reads the other's bindings until a function runs.
import {
  getNodeModel,
  transitionEvent,
  type NodeModelOutput,
} from "./node-models";
import { mulberry32, type Rng } from "./rng";

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
  /** arrivals via async edges — queue semantics, off the sync latency path */
  asyncArrivals: Flow;
}

export interface PropagationResult {
  /** reachable nodes, in the topological order traffic was propagated */
  order: string[];
  /** every node id appears; unreachable nodes carry zero flows */
  perNode: Record<string, NodeTraffic>;
  /** every edge id appears; edges off any reachable path carry zero */
  perEdge: Record<string, Flow>;
}

/** T-2.3 plugs the capacity model in here; default = serve everything. */
export type ServeFn = (
  node: DesignNode,
  def: ComponentDef,
  inflow: Flow,
) => Flow;

const serveAll: ServeFn = (_node, _def, inflow) => inflow;

/**
 * One propagation pass (tick-loop step 2): push `offered` from the entry node
 * through the graph in topological order. Per node: inflow = sync demand +
 * async arrivals → serve → absorb read hits (hitRate) → forward the rest
 * along outbound edges by trafficShare. missed = read − read × hitRate keeps
 * hits + misses === reads exact.
 */
export function propagateTraffic(
  graph: DesignGraph,
  offered: Flow,
  serve: ServeFn = serveAll,
): PropagationResult {
  const order = topoSort(graph);
  const perNode: Record<string, NodeTraffic> = {};
  for (const n of graph.nodes) {
    perNode[n.id] = { demand: zeroFlow(), asyncArrivals: zeroFlow() };
  }
  const perEdge: Record<string, Flow> = {};
  for (const e of graph.edges) perEdge[e.id] = zeroFlow();
  if (order.length === 0) return { order, perNode, perEdge };

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const position = new Map(order.map((id, i) => [id, i]));
  perNode[graph.entryNodeId].demand = { ...offered };

  for (const id of order) {
    const node = nodeById.get(id);
    if (!node) continue;
    const def = getComponentDef(node.kind);
    const traffic = perNode[id];
    const served = serve(node, def, addFlow(traffic.demand, traffic.asyncArrivals));
    const hitRate = configNumber(node, def, "hitRate");
    const forwarded: Flow = {
      read: served.read - served.read * hitRate,
      write: served.write,
    };
    for (const edge of graph.edges) {
      if (edge.source !== id) continue;
      const to = position.get(edge.target);
      // back/self edges (cycles) and edges into the entry carry nothing
      if (to === undefined || to <= (position.get(id) ?? 0)) continue;
      const flow = scaleFlow(forwarded, edge.trafficShare);
      perEdge[edge.id] = flow;
      const target = perNode[edge.target];
      if (edge.kind === "async") {
        target.asyncArrivals = addFlow(target.asyncArrivals, flow);
      } else {
        target.demand = addFlow(target.demand, flow);
      }
    }
  }
  return { order, perNode, perEdge };
}

/** Simulation clock: 10 ticks/s (dt = 100 ms). */
export const TICKS_PER_SEC = 10;

/** p95 ≈ 1.6 × mean — the spec's documented approximation. */
const P95_FACTOR = 1.6;

/**
 * What the scenario timeline does to one tick. T-2.5's stress rules compile
 * the timeline into these; until then the default is steady base load.
 */
export interface TickEffects {
  /** offered load at the entry this tick, before the read/write split */
  offeredRps: number;
  /** node id → alive fraction; absent = 1 (healthy). The kill rule writes here. */
  aliveFraction?: Record<string, number>;
}

export type ApplyRulesFn = (
  tickIndex: number,
  scenario: Scenario,
  rng: Rng,
) => TickEffects;

const steadyBaseLoad: ApplyRulesFn = (_tickIndex, scenario) => ({
  offeredRps: scenario.baseRps,
});

/**
 * Mean client-visible latency (tick-loop step 4): a node contributes its own
 * latencyMs plus the traffic-weighted latency of its sync downstream —
 * weight = edge flow / the node's served total, so a cache shortens the path
 * by exactly the traffic it absorbs. Async edges are off the client path
 * (queues absorb bursts; their delay shows in node metrics, not p95).
 * Back/self edges are skipped with the same rule propagation uses.
 */
function meanPathMs(
  graph: DesignGraph,
  prop: PropagationResult,
  outputs: Map<string, NodeModelOutput>,
): number {
  const position = new Map(prop.order.map((id, i) => [id, i]));
  const pathMs = new Map<string, number>();
  for (let i = prop.order.length - 1; i >= 0; i--) {
    const id = prop.order[i];
    const out = outputs.get(id);
    if (!out) continue;
    const servedTotal = flowRps(out.served);
    let ms = out.latencyMs;
    for (const edge of graph.edges) {
      if (edge.source !== id || edge.kind === "async") continue;
      const to = position.get(edge.target);
      if (to === undefined || to <= i) continue;
      const weight =
        servedTotal > 0 ? flowRps(prop.perEdge[edge.id]) / servedTotal : 0;
      ms += weight * (pathMs.get(edge.target) ?? 0);
    }
    pathMs.set(id, ms);
  }
  return pathMs.get(graph.entryNodeId) ?? 0;
}

/**
 * The full tick loop (03-simulation-engine): rules → propagate → node models
 * → latency → frame. Total on any input and pure: the only randomness is
 * mulberry32(scenario.seed) handed to `applyRules`, so the same
 * (graph, scenario, seed) always yields byte-identical frames.
 */
export function simulate(
  graph: DesignGraph,
  scenario: Scenario,
  applyRules: ApplyRulesFn = steadyBaseLoad,
): SimFrame[] {
  const rng = mulberry32(scenario.seed);
  const tickCount = Math.max(
    0,
    Math.round(scenario.durationSec * TICKS_PER_SEC),
  );
  const queuedPrev = new Map<string, Flow>(
    graph.nodes.map((n) => [n.id, zeroFlow()]),
  );
  const prevState = new Map<string, NodeState>(
    graph.nodes.map((n) => [n.id, "ok"]),
  );
  const frames: SimFrame[] = [];

  for (let tick = 0; tick < tickCount; tick++) {
    const effects = applyRules(tick, scenario, rng);
    const outputs = new Map<string, NodeModelOutput>();
    const evaluate = (
      node: DesignNode,
      def: ComponentDef,
      inflow: Flow,
    ): NodeModelOutput => {
      const out = getNodeModel(node.kind)({
        node,
        def,
        inflow,
        queuedPrev: queuedPrev.get(node.id) ?? zeroFlow(),
        aliveFraction: effects.aliveFraction?.[node.id] ?? 1,
      });
      outputs.set(node.id, out);
      return out;
    };
    const prop = propagateTraffic(
      graph,
      splitFlow(effects.offeredRps, scenario.readRatio),
      (node, def, inflow) => evaluate(node, def, inflow).served,
    );

    const perNode: SimFrame["perNode"] = {};
    const events: string[] = [];
    let totalDropped = 0;
    for (const node of graph.nodes) {
      // nodes propagation never reached still tick, so backlogs drain/drop
      const out =
        outputs.get(node.id) ??
        evaluate(node, getComponentDef(node.kind), zeroFlow());
      totalDropped += out.dropped;
      perNode[node.id] = {
        util: out.util,
        queued: flowRps(out.queued),
        dropped: out.dropped,
        state: out.state,
      };
      queuedPrev.set(node.id, out.queued);
      if (out.state !== prevState.get(node.id)) {
        prevState.set(node.id, out.state);
        events.push(
          transitionEvent(node.label, out.state, flowRps(out.served)),
        );
      }
    }

    const perEdge: SimFrame["perEdge"] = {};
    for (const edge of graph.edges) {
      perEdge[edge.id] = { rps: flowRps(prop.perEdge[edge.id]) };
    }

    frames.push({
      t: tick / TICKS_PER_SEC,
      perNode,
      perEdge,
      p95Ms: P95_FACTOR * meanPathMs(graph, prop, outputs),
      errorRate:
        effects.offeredRps > 0
          ? Math.min(1, totalDropped / effects.offeredRps)
          : totalDropped > 0
            ? 1
            : 0,
      // accepted-not-dropped; queued work counts until it drops. A graph
      // with no entry serves nothing, whatever was offered.
      servedRps:
        prop.order.length === 0
          ? 0
          : Math.max(0, effects.offeredRps - totalDropped),
      events,
    });
  }
  return frames;
}
