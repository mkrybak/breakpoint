import type {
  ComponentDef,
  ComponentKind,
  DesignGraph,
  DesignNode,
  Scenario,
  SimFrame,
  Verdict,
  VerdictFailure,
} from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  configBoolean,
  configNumber,
  configSelect,
  TICKS_PER_SEC,
} from "./engine";
import { formatRps } from "./node-models";
import { mulberry32 } from "./rng";
import { compileRules } from "./rules";

/** p95 must stay over budget for MORE than this long to fail */
const P95_STREAK_SEC = 5;
/** errorRate breaches inside the warmup don't fail the error-rate criterion */
const WARMUP_SEC = 3;
/** a kill is survived if errorRate holds budget for this long after it */
const KILL_WINDOW_SEC = 10;
/** over-provisioned = every capacity-limited node stays under this util */
const OVERPROVISION_UTIL = 0.1;

export interface VerdictInput {
  graph: DesignGraph;
  scenario: Scenario;
  frames: SimFrame[];
}

/** One pass/fail check over a finished run. Returns [] when it holds. */
export type Criterion = (input: VerdictInput) => VerdictFailure[];

/** One advisory check — hints for the grader, never fails the run. */
export type Advisor = (input: VerdictInput) => string[];

/** 0.123 → "12.3" — percent formatting for detail strings */
function pct(rate: number): string {
  return (rate * 100).toFixed(1);
}

/**
 * BFS from the entry over sync edges: the client-visible read paths (async
 * edges are off the read path, matching the latency model). Returns each
 * reached node's first-found parent (entry → null) for path reconstruction.
 * Deterministic — queue order plus graph.edges array order — and total on
 * cycles: every node is visited at most once.
 */
function syncReachability(graph: DesignGraph): Map<string, string | null> {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const parent = new Map<string, string | null>();
  if (!ids.has(graph.entryNodeId)) return parent;
  parent.set(graph.entryNodeId, null);
  const queue = [graph.entryNodeId];
  for (let i = 0; i < queue.length; i++) {
    for (const edge of graph.edges) {
      if (edge.source !== queue[i] || edge.kind !== "sync") continue;
      if (!ids.has(edge.target) || parent.has(edge.target)) continue;
      parent.set(edge.target, edge.source);
      queue.push(edge.target);
    }
  }
  return parent;
}

/** "Client → App → Postgres" — the BFS path from the entry to `id` */
function pathLabels(
  graph: DesignGraph,
  parent: Map<string, string | null>,
  id: string,
): string {
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const labels: string[] = [];
  for (let cur: string | null = id; cur !== null; cur = parent.get(cur) ?? null) {
    labels.unshift(labelById.get(cur) ?? cur);
  }
  return labels.join(" → ");
}

/** fail if p95 exceeds budget for more than P95_STREAK_SEC consecutive seconds */
export const p95Criterion: Criterion = ({ scenario, frames }) => {
  const maxTicks = P95_STREAK_SEC * TICKS_PER_SEC;
  let start = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].p95Ms > scenario.pass.p95Ms) {
      if (start === -1) start = i;
      if (i - start + 1 > maxTicks) {
        return [
          {
            criterion: "p95",
            atSec: frames[start].t,
            detail: `p95 above ${scenario.pass.p95Ms}ms budget for over ${P95_STREAK_SEC}s starting t=${frames[start].t}s`,
          },
        ];
      }
    } else {
      start = -1;
    }
  }
  return [];
};

/** fail on the first errorRate breach after the warmup */
export const errorRateCriterion: Criterion = ({ scenario, frames }) => {
  for (let i = WARMUP_SEC * TICKS_PER_SEC; i < frames.length; i++) {
    if (frames[i].errorRate > scenario.pass.maxErrorRate) {
      return [
        {
          criterion: "error-rate",
          atSec: frames[i].t,
          detail: `error rate ${pct(frames[i].errorRate)}% over ${pct(scenario.pass.maxErrorRate)}% budget at t=${frames[i].t}s`,
        },
      ];
    }
  }
  return [];
};

/**
 * Active when the scenario demands redundancy (minSurvivedKills ≥ 1): every
 * kill rule must keep errorRate within budget for KILL_WINDOW_SEC after it
 * fires. Catches breaches even inside the warmup the error-rate criterion
 * ignores; a post-warmup breach reports under both labels.
 */
export const killSurvivalCriterion: Criterion = ({ scenario, frames }) => {
  if ((scenario.pass.minSurvivedKills ?? 0) < 1) return [];
  const failures: VerdictFailure[] = [];
  for (const rule of scenario.timeline) {
    if (rule.rule !== "kill") continue;
    const from = Math.max(0, Math.round(rule.at * TICKS_PER_SEC));
    const to = Math.min(frames.length, from + KILL_WINDOW_SEC * TICKS_PER_SEC);
    for (let i = from; i < to; i++) {
      if (frames[i].errorRate > scenario.pass.maxErrorRate) {
        failures.push({
          criterion: "kill-survival",
          atSec: frames[i].t,
          detail: `kill "${rule.target}" at t=${rule.at}s not survived — error rate ${pct(frames[i].errorRate)}% at t=${frames[i].t}s`,
        });
        break;
      }
    }
  }
  return failures;
};

/**
 * Why a store's reads are eventually consistent, or null if they aren't.
 * Extension point: a new store kind adds an entry; kinds absent here never
 * violate the strong-consistency NFR (cache/CDN are copies, not the system
 * of record — the check targets where entities live).
 */
const eventualReadReasons: Partial<
  Record<ComponentKind, (node: DesignNode, def: ComponentDef) => string | null>
> = {
  db_nosql: (node, def) => {
    const mode = configSelect(node, def, "consistencyMode");
    if (mode === "quorum" || mode === "strong") return null;
    return `consistencyMode "${mode}"`;
  },
  db_sql: (node, def) => {
    const replicas = configNumber(node, def, "replicas", 0);
    if (replicas < 1) return null;
    if (configBoolean(node, def, "readYourWrites")) return null;
    return `${replicas} read replica(s) without read-your-writes`;
  },
};

/** static walk: sync read paths must not hit an eventually-consistent store */
export const consistencyCriterion: Criterion = ({ graph, scenario }) => {
  if (scenario.pass.consistency !== "strong") return [];
  const parent = syncReachability(graph);
  const failures: VerdictFailure[] = [];
  for (const node of graph.nodes) {
    if (!parent.has(node.id)) continue;
    const reasonFor = eventualReadReasons[node.kind];
    if (!reasonFor) continue;
    const reason = reasonFor(node, getComponentDef(node.kind));
    if (reason === null) continue;
    failures.push({
      criterion: "consistency",
      atSec: 0,
      detail: `strong consistency violated: read path ${pathLabels(graph, parent, node.id)} hits eventually-consistent "${node.label}" (${reason})`,
    });
  }
  return failures;
};

/** >10× headroom everywhere: no capacity-limited node ever leaves idle */
export const overProvisioningAdvisor: Advisor = ({ graph, frames }) => {
  if (frames.length === 0) return [];
  const limited = graph.nodes.filter(
    (n) => getComponentDef(n.kind).capacity.rps !== undefined,
  );
  if (limited.length === 0) return [];
  for (const node of limited) {
    for (const frame of frames) {
      if ((frame.perNode[node.id]?.util ?? 0) >= OVERPROVISION_UTIL) return [];
    }
  }
  return [
    "Over-provisioned: no capacity-limited component ever exceeds 10% utilization",
  ];
};

/**
 * Peak offered RPS, replayed through the compiled rules — exact, not
 * reconstructed from frames. The fresh rng consumes draws exactly like the
 * real run (kill), so the series matches what simulate() saw.
 */
function peakOfferedRps(
  graph: DesignGraph,
  scenario: Scenario,
  tickCount: number,
): number {
  const apply = compileRules(graph, scenario);
  const rng = mulberry32(scenario.seed);
  let peak = 0;
  for (let tick = 0; tick < tickCount; tick++) {
    peak = Math.max(peak, apply(tick, scenario, rng).offeredRps);
  }
  return peak;
}

/** sharded db_sql whose whole write load fits a single primary */
export const prematureShardingAdvisor: Advisor = ({
  graph,
  scenario,
  frames,
}) => {
  const sharded = graph.nodes.filter(
    (n) =>
      n.kind === "db_sql" &&
      configBoolean(n, getComponentDef(n.kind), "sharded"),
  );
  if (sharded.length === 0) return [];
  const peakWrite =
    peakOfferedRps(graph, scenario, frames.length) * (1 - scenario.readRatio);
  const advisories: string[] = [];
  for (const node of sharded) {
    const writeCap = getComponentDef(node.kind).capacity.writeRps;
    if (writeCap !== undefined && peakWrite <= writeCap) {
      advisories.push(
        `Premature sharding: "${node.label}" is sharded but peak write load ${formatRps(peakWrite)} RPS fits a single primary (${formatRps(writeCap)} RPS)`,
      );
    }
  }
  return advisories;
};

/** queue/stream reached over sync edges = delivery delay on client latency */
export const queueOnSyncPathAdvisor: Advisor = ({ graph }) => {
  const parent = syncReachability(graph);
  const advisories: string[] = [];
  for (const node of graph.nodes) {
    if (!parent.has(node.id) || node.id === graph.entryNodeId) continue;
    if (getComponentDef(node.kind).category !== "async") continue;
    advisories.push(
      `Queue on sync path: "${node.label}" is reached synchronously (${pathLabels(graph, parent, node.id)}) — its delivery delay lands on client latency`,
    );
  }
  return advisories;
};

/** Extension point (05-engines): new verdict check = push a Criterion here. */
export const criteria: Criterion[] = [
  p95Criterion,
  errorRateCriterion,
  killSurvivalCriterion,
  consistencyCriterion,
];

/** Advisory flags — shown to the grader, never fail the run. */
export const advisors: Advisor[] = [
  overProvisioningAdvisor,
  prematureShardingAdvisor,
  queueOnSyncPathAdvisor,
];

/**
 * The verdict over a finished run (03-simulation-engine "Verdict"). Pure and
 * deterministic: same (graph, scenario, frames) → same verdict.
 */
export function evaluateVerdict(
  graph: DesignGraph,
  scenario: Scenario,
  frames: SimFrame[],
): Verdict {
  const input: VerdictInput = { graph, scenario, frames };
  const failures = criteria.flatMap((criterion) => criterion(input));
  return {
    passed: failures.length === 0,
    failures,
    advisories: advisors.flatMap((advisor) => advisor(input)),
  };
}
