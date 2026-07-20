import type { DesignGraph, DesignNode, Scenario, StressRule } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  configNumber,
  TICKS_PER_SEC,
  type ApplyRulesFn,
  type TickEffects,
} from "./engine";
import { loadShareUnits } from "./node-models";
import type { Rng } from "./rng";

/** flush recovery: hit rate climbs back toward config at the spec's ~1.5%/tick */
const FLUSH_RECOVERY_PER_TICK = 0.015;

/** Scenario timeline times are seconds; the engine thinks in ticks. */
function secToTick(sec: number): number {
  return Math.max(0, Math.round(sec * TICKS_PER_SEC));
}

/**
 * Mutable per-tick accumulator the appliers write into. Composition rules:
 * ramps rewrite `baseRps` (a later ramp interpolates from the value earlier
 * ones left), spikes multiply `factor` (offered = baseRps × factor),
 * capacity fractions compose by ×, hit-rate overrides by min, dead edges by
 * union.
 */
export interface EffectsDraft {
  baseRps: number;
  factor: number;
  capacityFraction: Record<string, number>;
  hitRate: Record<string, number>;
  deadEdges: Set<string>;
}

/** One compiled rule. Called every tick, in timeline order (`at` ascending). */
export type RuleApplier = (draft: EffectsDraft, tick: number, rng: Rng) => void;

/** `target` is a node id when one matches, else a ComponentKind. */
function matchTargets(graph: DesignGraph, target: string): DesignNode[] {
  const byId = graph.nodes.filter((n) => n.id === target);
  return byId.length > 0 ? byId : graph.nodes.filter((n) => n.kind === target);
}

type AppliersByRule = {
  [K in StressRule["rule"]]: (
    rule: Extract<StressRule, { rule: K }>,
    graph: DesignGraph,
  ) => RuleApplier;
};

/**
 * Extension point (05-engines): rule #7 = one entry here plus its arm in the
 * core StressRule union. Factories close over the rule and graph; the
 * returned applier may hold per-run state, which is why compileRules is
 * single-run.
 */
export const ruleAppliers: AppliersByRule = {
  /** linearly interpolate offered RPS to toRps over overSec, then hold */
  ramp: (rule) => {
    const atTick = secToTick(rule.at);
    const overTicks = secToTick(rule.overSec);
    let startRps: number | undefined; // captured on the first active tick
    return (draft, tick) => {
      if (tick < atTick) return;
      startRps ??= draft.baseRps;
      const progress =
        overTicks > 0 ? Math.min(1, (tick - atTick) / overTicks) : 1;
      draft.baseRps = startRps + (rule.toRps - startRps) * progress;
    };
  },

  /** multiply offered RPS by factor inside [at, at + forSec) */
  spike: (rule) => {
    const atTick = secToTick(rule.at);
    const endTick = atTick + secToTick(rule.forSec);
    return (draft, tick) => {
      if (tick >= atTick && tick < endTick) draft.factor *= rule.factor;
    };
  },

  /**
   * Down `count` instances of the target, picked by the run's seeded RNG
   * from the flattened pool of every matched node's load-share units. Fires
   * once; the dead stay dead for the rest of the run.
   */
  kill: (rule, graph) => {
    const atTick = secToTick(rule.at);
    let fraction: Record<string, number> | null = null;
    return (draft, tick, rng) => {
      if (tick < atTick) return;
      if (fraction === null) {
        fraction = {};
        const units = new Map<string, number>();
        const pool: string[] = [];
        for (const node of matchTargets(graph, rule.target)) {
          const u = loadShareUnits(node, getComponentDef(node.kind));
          units.set(node.id, u);
          for (let i = 0; i < u; i++) pool.push(node.id);
        }
        const count = Math.min(rule.count ?? 1, pool.length);
        const killed = new Map<string, number>();
        for (let i = 0; i < count; i++) {
          const victim = pool.splice(Math.floor(rng() * pool.length), 1)[0];
          killed.set(victim, (killed.get(victim) ?? 0) + 1);
        }
        for (const [id, k] of killed) {
          const u = units.get(id) ?? 1;
          fraction[id] = (u - k) / u;
        }
      }
      for (const [id, f] of Object.entries(fraction)) {
        draft.capacityFraction[id] = (draft.capacityFraction[id] ?? 1) * f;
      }
    };
  },

  /**
   * Zero every cache's hit rate at `at`; it recovers toward the configured
   * rate at FLUSH_RECOVERY_PER_TICK. Stateless: the override is a pure
   * function of (tick − atTick), dropped once it reaches the config value.
   */
  flush: (rule, graph) => {
    const atTick = secToTick(rule.at);
    const configured = graph.nodes
      .filter((n) => n.kind === "cache")
      .map((n) => ({
        id: n.id,
        rate: configNumber(n, getComponentDef(n.kind), "hitRate"),
      }));
    return (draft, tick) => {
      if (tick < atTick) return;
      const recovered = FLUSH_RECOVERY_PER_TICK * (tick - atTick);
      for (const { id, rate } of configured) {
        if (recovered >= rate) continue; // back at config — stop overriding
        draft.hitRate[id] = Math.min(draft.hitRate[id] ?? Infinity, recovered);
      }
    };
  },

  /** every edge touching the target carries nothing inside [at, at + forSec) */
  partition: (rule, graph) => {
    const atTick = secToTick(rule.at);
    const endTick = atTick + secToTick(rule.forSec);
    const matched = new Set(matchTargets(graph, rule.target).map((n) => n.id));
    const edgeIds = graph.edges
      .filter((e) => matched.has(e.source) || matched.has(e.target))
      .map((e) => e.id);
    return (draft, tick) => {
      if (tick < atTick || tick >= endTick) return;
      for (const id of edgeIds) draft.deadEdges.add(id);
    };
  },

  /**
   * Fraction `skew` of traffic hits one of a node's load-share units; that
   * unit saturates at its own ceiling, so sustainable throughput drops to
   * unitCap / skew — capacity multiplier min(1, 1 / (skew × units)).
   * Storage-category nodes only: stateless compute rebalances, partitioned
   * state cannot — this is what breaks "just shard it".
   */
  hotkey: (rule, graph) => {
    const atTick = secToTick(rule.at);
    const endTick = atTick + secToTick(rule.forSec);
    const mult = new Map<string, number>();
    for (const node of graph.nodes) {
      const def = getComponentDef(node.kind);
      if (def.category !== "storage") continue;
      const m = Math.min(1, 1 / (rule.skew * loadShareUnits(node, def)));
      if (m < 1) mult.set(node.id, m);
    }
    return (draft, tick) => {
      if (tick < atTick || tick >= endTick) return;
      for (const [id, m] of mult) {
        draft.capacityFraction[id] = (draft.capacityFraction[id] ?? 1) * m;
      }
    };
  },
};

/** A compiled timeline the worker can extend mid-run (chaos button). */
export interface RuleEngine {
  apply: ApplyRulesFn;
  /** Append one rule to the running timeline; it fires per its own `at`. */
  inject(rule: StressRule): void;
}

/**
 * Compile a scenario timeline into the engine's rules seam. Single-run: the
 * appliers hold per-run state (a ramp's captured baseline, a kill's sampled
 * victims) — compile fresh for every simulate() call, passing the same
 * scenario to both. `inject` appends a chaos rule's applier after the
 * timeline's: last position is correct for every composition rule (capacity
 * ×, hit-rate min, dead-edge ∪ are commutative; a ramp interpolates from
 * whatever earlier appliers left, which is what a live ramp should do).
 */
export function createRuleEngine(
  graph: DesignGraph,
  scenario: Scenario,
): RuleEngine {
  const compileRule = (rule: StressRule): RuleApplier =>
    // safe: the map is keyed by the same discriminant that picks the entry
    (ruleAppliers[rule.rule] as (r: StressRule, g: DesignGraph) => RuleApplier)(
      rule,
      graph,
    );

  const appliers = [...scenario.timeline]
    .sort((a, b) => a.at - b.at) // stable sort: ties keep timeline order
    .map(compileRule);

  const apply: ApplyRulesFn = (tick, sc, rng) => {
    const draft: EffectsDraft = {
      baseRps: sc.baseRps,
      factor: 1,
      capacityFraction: {},
      hitRate: {},
      deadEdges: new Set(),
    };
    for (const applier of appliers) applier(draft, tick, rng);
    const effects: TickEffects = { offeredRps: draft.baseRps * draft.factor };
    if (Object.keys(draft.capacityFraction).length > 0) {
      effects.aliveFraction = draft.capacityFraction;
    }
    if (Object.keys(draft.hitRate).length > 0) effects.hitRate = draft.hitRate;
    if (draft.deadEdges.size > 0) effects.deadEdges = [...draft.deadEdges];
    return effects;
  };

  return {
    apply,
    inject: (rule) => {
      appliers.push(compileRule(rule));
    },
  };
}

/** The immutable-timeline form — what verdict.ts and the tests use. */
export function compileRules(
  graph: DesignGraph,
  scenario: Scenario,
): ApplyRulesFn {
  return createRuleEngine(graph, scenario).apply;
}
