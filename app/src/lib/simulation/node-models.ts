import type {
  ComponentDef,
  ComponentKind,
  DesignNode,
  NodeState,
} from "@/lib/core";
import {
  addFlow,
  configBoolean,
  configNumber,
  flowRps,
  type Flow,
} from "./engine";

/**
 * Effective per-direction ceilings for one node this tick, in RPS.
 * Infinity = unlimited (registry omits the field) — internal only, never
 * emitted in model outputs.
 */
export interface EffectiveCapacity {
  /** read ceiling when `split`, total ceiling otherwise */
  readRps: number;
  writeRps: number;
  /**
   * true = the def declares writeRps: reads and writes have independent
   * ceilings (db_sql: 30k read / 15k write). false = readRps caps the
   * combined flow.
   */
  split: boolean;
}

export type CapacityFn = (
  node: DesignNode,
  def: ComponentDef,
  aliveFraction: number,
) => EffectiveCapacity;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * base × replicas (horizontal scaling only) × aliveFraction. aliveFraction 0
 * short-circuits to zero capacity — Infinity × 0 is NaN, and a dead
 * unlimited node must still serve nothing.
 */
export const defaultCapacity: CapacityFn = (node, def, aliveFraction) => {
  const alive = clamp01(aliveFraction);
  const writeBase = def.capacity.writeRps;
  const split = writeBase !== undefined;
  if (alive === 0) return { readRps: 0, writeRps: 0, split };
  const replicas =
    def.scaling === "horizontal" ? configNumber(node, def, "replicas", 1) : 1;
  const mult = replicas * alive;
  const readRps = (def.capacity.rps ?? Infinity) * mult;
  return {
    readRps,
    writeRps: writeBase !== undefined ? writeBase * mult : readRps,
    split,
  };
};

/**
 * db_sql scales differently: "replicas" counts read replicas beyond the
 * primary, so reads scale ×(1 + replicas) (the generic ×replicas would zero
 * capacity at the field's default 0) and writes stay at the single-primary
 * ceiling — unless sharded, where each unit is a full read-write shard and
 * the write ceiling scales by the same (1 + replicas).
 */
export const dbSqlCapacity: CapacityFn = (node, def, aliveFraction) => {
  const alive = clamp01(aliveFraction);
  if (alive === 0) return { readRps: 0, writeRps: 0, split: true };
  const units = 1 + configNumber(node, def, "replicas", 0);
  const writeUnits = configBoolean(node, def, "sharded") ? units : 1;
  return {
    readRps: (def.capacity.rps ?? Infinity) * units * alive,
    writeRps: (def.capacity.writeRps ?? Infinity) * writeUnits * alive,
    split: true,
  };
};

/**
 * How many load-sharing units a node spreads traffic across — replicas for
 * horizontally scaled kinds, primary + read replicas for db_sql (its
 * convention, see dbSqlCapacity), 1 otherwise. The kill rule downs whole
 * units; the hotkey rule concentrates load onto one of them.
 */
export function loadShareUnits(node: DesignNode, def: ComponentDef): number {
  if (node.kind === "db_sql") {
    return 1 + Math.round(configNumber(node, def, "replicas", 0));
  }
  if (def.scaling === "horizontal") {
    return Math.max(1, Math.round(configNumber(node, def, "replicas", 1)));
  }
  return 1;
}

export interface NodeModelInput {
  node: DesignNode;
  def: ComponentDef;
  /** this tick's arrivals from propagation (sync demand + async arrivals) */
  inflow: Flow;
  /** backlog carried from the previous tick; zero flow on the first tick */
  queuedPrev: Flow;
  /** 1 = healthy; the kill rule (T-2.5) lowers it; 0 = down */
  aliveFraction: number;
}

export interface NodeModelOutput {
  served: Flow;
  /** feed back as queuedPrev next tick */
  queued: Flow;
  /** RPS shed this tick — load beyond capacity and the queue cap */
  dropped: number;
  /** demand / effectiveCapacity; max of the two ratios when split; 0 when unlimited */
  util: number;
  /** mean ms a request spends at this node: M/M/1 service time + queue wait */
  latencyMs: number;
  state: NodeState;
}

export type NodeModel = (input: NodeModelInput) => NodeModelOutput;

function ratio(part: number, cap: number): number {
  return cap > 0 && Number.isFinite(cap) ? part / cap : 0;
}

/**
 * Split `total` across read/write proportionally to `flow`. Exact-total
 * forms: read is computed first and write = total − read, so
 * read + write === total despite float rounding; a one-sided flow
 * short-circuits so no phantom fraction appears on the empty side.
 */
function splitByFlow(flow: Flow, flowTotal: number, total: number): Flow {
  let read: number;
  if (total === flowTotal) read = flow.read;
  else if (flow.write === 0) read = total;
  else if (flow.read === 0) read = 0;
  else read = flow.read * (total / flowTotal);
  return { read, write: total - read };
}

/** M/M/1 service time blows up at util → 1; the spec caps the term at 0.95. */
const MAX_MM1_UTIL = 0.95;

/**
 * The spec's tick-loop step 3 plus the per-node half of step 4 — latency —
 * (03-simulation-engine.md), shared by every
 * kind — only the capacity computation varies. All quantities stay in the
 * spec's literal RPS units; the queue backlog re-enters demand next tick and
 * clamps at maxQueue = 0.5 × total capacity ("0.5s of capacity").
 */
export function makeModel(capacity: CapacityFn): NodeModel {
  return ({ node, def, inflow, queuedPrev, aliveFraction }) => {
    const cap = capacity(node, def, aliveFraction);
    const demand = addFlow(inflow, queuedPrev);
    const demandTotal = flowRps(demand);
    const totalCap = cap.split ? cap.readRps + cap.writeRps : cap.readRps;

    let served: Flow;
    let util: number;
    if (cap.split) {
      served = {
        read: Math.min(demand.read, cap.readRps),
        write: Math.min(demand.write, cap.writeRps),
      };
      util = Math.max(
        ratio(demand.read, cap.readRps),
        ratio(demand.write, cap.writeRps),
      );
    } else {
      served = splitByFlow(demand, demandTotal, Math.min(demandTotal, cap.readRps));
      util = ratio(demandTotal, cap.readRps);
    }

    const overflow: Flow = {
      read: demand.read - served.read,
      write: demand.write - served.write,
    };
    const overflowTotal = flowRps(overflow);
    const maxQueue = Number.isFinite(totalCap) ? 0.5 * totalCap : 0;
    const queuedTotal = Math.min(overflowTotal, maxQueue);
    // queuedTotal > 0 implies a finite positive totalCap (else maxQueue is 0)
    const queueWaitMs = queuedTotal > 0 ? (queuedTotal / totalCap) * 1000 : 0;

    return {
      served,
      queued: splitByFlow(overflow, overflowTotal, queuedTotal),
      dropped: overflowTotal - queuedTotal,
      util,
      latencyMs:
        def.latency.baseMs / (1 - Math.min(util, MAX_MM1_UTIL)) + queueWaitMs,
      state: nodeState(util, totalCap),
    };
  };
}

/**
 * Spec thresholds: ok < 0.7 ≤ hot < 0.9 ≤ saturated ≤ 1.0 < overloaded.
 * Zero total capacity (killed) = down, regardless of util.
 */
export function nodeState(util: number, totalCapacityRps: number): NodeState {
  if (totalCapacityRps === 0) return "down";
  if (util < 0.7) return "ok";
  if (util < 0.9) return "hot";
  if (util <= 1) return "saturated";
  return "overloaded";
}

export const defaultModel: NodeModel = makeModel(defaultCapacity);

/**
 * Extension point (05-engines): a kind needing custom math registers here;
 * every other kind gets defaultModel.
 */
export const modelByKind: Partial<Record<ComponentKind, NodeModel>> = {
  db_sql: makeModel(dbSqlCapacity),
};

export function getNodeModel(kind: ComponentKind): NodeModel {
  return modelByKind[kind] ?? defaultModel;
}

/** Deterministic RPS for log lines: 8200 → "8.2k", 4000 → "4k", 950 → "950". */
export function formatRps(rps: number): string {
  if (rps >= 1000) return `${Math.round(rps / 100) / 10}k`;
  return `${Math.round(rps)}`;
}

const transitionMessage: Record<
  NodeState,
  (label: string, rps: string) => string
> = {
  ok: (label) => `${label} recovered`,
  hot: (label) => `${label} running hot`,
  saturated: (label, rps) => `${label} saturated at ${rps} RPS`,
  overloaded: (label, rps) => `${label} overloaded at ${rps} RPS — shedding load`,
  down: (label) => `${label} down`,
};

/**
 * Log line for a state change. The tick loop (T-2.4) calls this when a
 * node's state differs from the previous tick (initial state "ok").
 */
export function transitionEvent(
  label: string,
  to: NodeState,
  servedRps: number,
): string {
  return transitionMessage[to](label, formatRps(servedRps));
}
