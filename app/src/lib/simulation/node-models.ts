import type {
  ComponentDef,
  ComponentKind,
  DesignNode,
  NodeState,
} from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  addFlow,
  configBoolean,
  configNumber,
  flowRps,
  TICKS_PER_SEC,
  type Flow,
} from "./engine";
import { logTimeSuffix } from "./breaker";

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
  /** async nodes only: RPS the consumers can pull this tick; absent = unlimited. Other models ignore it. */
  drainRps?: number;
}

export interface NodeModelOutput {
  served: Flow;
  /** feed back as queuedPrev next tick */
  queued: Flow;
  /** RPS shed this tick — load beyond capacity and the queue cap */
  dropped: number;
  /** share of this tick's arrivals shed: min(1, dropped / arrivals), 0 with no arrivals. Tail-drop: a full queue rejects new arrivals first (T-8.5). */
  rejectFraction: number;
  /** demand / effectiveCapacity; max of the two ratios when split; 0 when unlimited */
  util: number;
  /** mean ms a request spends at this node: M/M/1 service time + queue wait */
  latencyMs: number;
  /**
   * variance (ms²) of the time a request spends here: the M/M/1 part is
   * exponential (variance = its mean²); backlog wait is a fixed shift (0)
   */
  latencyVarMs2: number;
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
 * Share of calls slower than `timeoutMs` when the callee's mean path latency
 * is `meanMs`. M/M/1 time-in-system is exponential: P(T > t) = exp(−t/mean).
 */
export function timeoutFraction(meanMs: number, timeoutMs: number): number {
  return meanMs > 0 ? Math.exp(-timeoutMs / meanMs) : 0;
}

/** Mean time a caller waits per attempt through a timeout: E[min(T, t)] = mean × (1 − exp(−t/mean)). */
export function callLatencyMs(
  meanMs: number,
  timeoutMs: number | undefined,
): number {
  if (timeoutMs === undefined || meanMs <= 0) return meanMs;
  return meanMs * (1 - Math.exp(-timeoutMs / meanMs));
}

/**
 * The spec's tick-loop step 3 plus the per-node half of step 4 — latency
 * mean and variance —
 * (03-simulation-engine.md), shared by every
 * kind — only the capacity computation varies. All quantities stay in the
 * spec's literal RPS units; the queue backlog re-enters demand next tick and
 * clamps at maxQueue = 0.5 × total capacity ("0.5s of capacity"). That cap
 * applies to non-async nodes only — queue/stream use makeBufferModel.
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
    const dropped = overflowTotal - queuedTotal;
    const arrivals = flowRps(inflow);
    const sojournMs = def.latency.baseMs / (1 - Math.min(util, MAX_MM1_UTIL));

    return {
      served,
      queued: splitByFlow(overflow, overflowTotal, queuedTotal),
      dropped,
      rejectFraction: arrivals > 0 ? Math.min(1, dropped / arrivals) : 0,
      util,
      latencyMs: sojournMs + queueWaitMs,
      latencyVarMs2: sojournMs * sojournMs,
      state: nodeState(util, totalCap),
    };
  };
}

/** Retention fallback for an async kind whose def lacks `retentionMsgs`. */
export const DEFAULT_RETENTION_MSGS = 1_000_000;

/**
 * Async nodes (queue, stream — 03-simulation-engine "Async nodes"): a buffer
 * with pull semantics. It serves min(demand, own capacity, drainRps), where
 * drainRps is what its consumers can take this tick (absent = unlimited, a
 * sink queue); the rest is carried as backlog, capped by `retentionMsgs`
 * converted to the engine's carry units (messages × TICKS_PER_SEC — a carried
 * Q re-enters as Q RPS for one 0.1 s tick). Backlog beyond retention drops; a
 * down node (zero capacity) retains nothing. util = max(ingest util,
 * overflow ÷ retention), so a filling buffer goes hot/saturated and turns
 * overloaded exactly when it sheds. latencyMs is the enqueue cost only — the
 * backlog wait is consumer lag (lagSec), not producer latency.
 */
export function makeBufferModel(capacity: CapacityFn): NodeModel {
  return ({ node, def, inflow, queuedPrev, aliveFraction, drainRps = Infinity }) => {
    const cap = capacity(node, def, aliveFraction);
    const ownCap = cap.split ? cap.readRps + cap.writeRps : cap.readRps;
    const demand = addFlow(inflow, queuedPrev);
    const demandTotal = flowRps(demand);
    const servedTotal = Math.min(demandTotal, ownCap, Math.max(0, drainRps));
    const served = splitByFlow(demand, demandTotal, servedTotal);
    const overflow: Flow = {
      read: demand.read - served.read,
      write: demand.write - served.write,
    };
    const overflowTotal = flowRps(overflow);
    const retention =
      ownCap > 0
        ? configNumber(node, def, "retentionMsgs", DEFAULT_RETENTION_MSGS) * TICKS_PER_SEC
        : 0;
    const queuedTotal = Math.min(overflowTotal, retention);
    const ingestUtil = ratio(flowRps(inflow), ownCap);
    const util = Math.max(ingestUtil, ratio(overflowTotal, retention));
    const dropped = overflowTotal - queuedTotal;
    const arrivals = flowRps(inflow);
    const enqueueMs = def.latency.baseMs / (1 - Math.min(ingestUtil, MAX_MM1_UTIL));
    return {
      served,
      queued: splitByFlow(overflow, overflowTotal, queuedTotal),
      dropped,
      rejectFraction: arrivals > 0 ? Math.min(1, dropped / arrivals) : 0,
      util,
      latencyMs: enqueueMs,
      latencyVarMs2: enqueueMs * enqueueMs,
      state: nodeState(util, ownCap),
    };
  };
}

/**
 * Pull headroom: the max total RPS of `mix`-shaped flow a consumer takes this
 * tick on top of its own carried backlog. Split capacities bind on whichever
 * direction fills first. Infinity when unlimited.
 */
export function consumerHeadroomRps(cap: EffectiveCapacity, backlog: Flow, mix: Flow): number {
  if (!cap.split) return Math.max(0, cap.readRps - flowRps(backlog));
  const read = Math.max(0, cap.readRps - backlog.read);
  const write = Math.max(0, cap.writeRps - backlog.write);
  const total = flowRps(mix);
  if (total === 0) return read + write;
  const byRead = mix.read > 0 ? read / (mix.read / total) : Infinity;
  const byWrite = mix.write > 0 ? write / (mix.write / total) : Infinity;
  return Math.min(byRead, byWrite);
}

/**
 * Consumer lag in seconds: depth ÷ drain rate ("time to catch up at the
 * current rate"); 0 with no backlog; an undrained backlog ages one tick.
 */
export function consumerLagSec(depthMsgs: number, drainedRps: number, prevLagSec: number): number {
  if (depthMsgs === 0) return 0;
  if (drainedRps > 0) return depthMsgs / drainedRps;
  return prevLagSec + 1 / TICKS_PER_SEC;
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
export const bufferModel: NodeModel = makeBufferModel(defaultCapacity);

/** Extension point: a kind with custom capacity math registers here (pull headroom reads it) AND its model in modelByKind. */
export const capacityByKind: Partial<Record<ComponentKind, CapacityFn>> = {
  db_sql: dbSqlCapacity,
};

export function getCapacityFn(kind: ComponentKind): CapacityFn {
  return capacityByKind[kind] ?? defaultCapacity;
}

/**
 * Extension point (05-engines): a kind needing custom math registers here;
 * every other kind gets bufferModel (async category) or defaultModel.
 */
export const modelByKind: Partial<Record<ComponentKind, NodeModel>> = {
  db_sql: makeModel(dbSqlCapacity),
};

export function getNodeModel(kind: ComponentKind): NodeModel {
  return (
    modelByKind[kind] ??
    (getComponentDef(kind).category === "async" ? bufferModel : defaultModel)
  );
}

/** Deterministic RPS for log lines: 8200 → "8.2k", 4000 → "4k", 950 → "950". */
export function formatRps(rps: number): string {
  if (rps >= 1000) return `${Math.round(rps / 100) / 10}k`;
  return `${Math.round(rps)}`;
}

/** A node's state as the event log reports it: "idle" = ok only because breakers cut all its load (T-12.2). */
export type LoggedState = NodeState | "idle";

/** `at` = "" or " at 21.1s" (a held line released late, T-12.2). */
const transitionMessage: Record<
  LoggedState,
  (label: string, rps: string, at: string) => string
> = {
  ok: (label, _rps, at) => `${label} recovered${at}`,
  idle: (label, _rps, at) => `${label} idle${at} (breaker open)`,
  hot: (label, _rps, at) => `${label} running hot${at}`,
  saturated: (label, rps, at) => `${label} saturated at ${rps} RPS${at}`,
  overloaded: (label, rps, at) =>
    `${label} overloaded at ${rps} RPS${at} — shedding load`,
  down: (label, _rps, at) => `${label} down${at}`,
};

/**
 * Log line for a state change. The tick loop (T-2.4) calls this when the
 * node's logged state changes (initial "ok"). `atSec` stamps a line the log
 * releases after the tick it happened on (T-12.2).
 */
export function transitionEvent(
  label: string,
  to: LoggedState,
  servedRps: number,
  atSec?: number,
): string {
  return transitionMessage[to](
    label,
    formatRps(servedRps),
    logTimeSuffix(atSec),
  );
}
