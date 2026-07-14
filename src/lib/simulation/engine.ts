import type { ComponentDef, DesignEdge, DesignGraph, DesignNode } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";

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
