import type {
  BreakerTrip,
  DesignGraph,
  RunResult,
  Scenario,
  Verdict,
  VerdictFailure,
} from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import type { SimStatus } from "@/stores/sim-store";

/** p95 latency → "142 ms". */
export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

/** Tooltip on the HUD's p95 card: how the number is estimated (03-simulation-engine step 4). */
export const P95_HINT =
  "95% of requests finish faster than this: estimated as the average response time plus two standard deviations, and because a component's delay gets more variable as it gets busier, p95 climbs faster than the average.";

/** Error rate 0–1 → "3.2%". */
export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** RPS with a k-suffix at/above 1000: 8200 → "8.2k", 500 → "500". */
export function formatRps(rps: number): string {
  return rps >= 1000 ? `${(rps / 1000).toFixed(1)}k` : `${Math.round(rps)}`;
}

export type LogSeverity = "critical" | "warning" | "recovered" | "info";

/**
 * Classify an engine event line by its state-transition wording (node-models
 * `transitionMessage`). Matches distinctive tokens rather than the user-set node
 * label: "idle (breaker open)" → info (checked first: it contains "breaker
 * open"), "overloaded"/"shedding load"/trailing " down" → critical, "saturated"/
 * "running hot"/"breaker open"/"breaker re-opened" → warning, "recovered"/
 * "breaker closed" → good, anything else → info. A line the engine released
 * late carries " at 21.1s" after its state word (T-12.2).
 */
export function classifyLogSeverity(message: string): LogSeverity {
  if (/ idle( at [\d.]+s)? \(breaker open\)$/.test(message)) return "info";
  if (/overloaded|shedding load| down( at [\d.]+s)?$/.test(message)) {
    return "critical";
  }
  if (/saturated|running hot|breaker open|breaker re-opened/.test(message)) {
    return "warning";
  }
  if (/recovered|breaker closed/.test(message)) return "recovered";
  return "info";
}

/** Tailwind text color per severity, for the event log. */
export const LOG_SEVERITY_COLOR: Record<LogSeverity, string> = {
  critical: "text-red-400",
  warning: "text-amber-400",
  recovered: "text-green-400",
  info: "text-neutral-400",
};

export type RunTone = "idle" | "running" | "pass" | "fail";

/** Verdict-banner label + tone for the current run phase. */
export function describeRunStatus(
  status: SimStatus,
  result: RunResult | null,
): { label: string; tone: RunTone } {
  switch (status) {
    case "running":
      return { label: "Running…", tone: "running" };
    case "paused":
      return { label: "Paused", tone: "running" };
    case "done":
      if (result?.verdict.passed) return { label: "Passed", tone: "pass" };
      if (result) return { label: "Failed", tone: "fail" };
      return { label: "Done", tone: "idle" };
    default:
      return { label: "Idle", tone: "idle" };
  }
}

/** Budget rate 0–1 → "1%", "0.5%" (no trailing zeros). */
export function formatBudgetPct(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/** Sim seconds → "12.3s" ("4s", not "4.0s"). */
export function formatSec(t: number): string {
  return `${Number(t.toFixed(1))}s`;
}

/** Consumer lag seconds → "0.4 s", "12 s" (one decimal under 10s). */
export function formatLag(sec: number): string {
  return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s`;
}

/** True when the design has a queue/stream — the HUD then shows consumer lag. */
export function hasAsyncNodes(graph: DesignGraph): boolean {
  return graph.nodes.some((n) => getComponentDef(n.kind).category === "async");
}

/** Quick mode's read-only goal line, e.g. "Keep p95 under 200 ms and errors under 1%." */
export function describeScenarioGoal(scenario: Scenario): string {
  let goal = `Keep p95 under ${scenario.pass.p95Ms} ms and errors under ${formatBudgetPct(scenario.pass.maxErrorRate)}`;
  if ((scenario.pass.minSurvivedKills ?? 0) >= 1) {
    goal += ", even when a server goes down";
  }
  if (scenario.pass.consistency === "strong") {
    goal += ", with strongly consistent reads";
  }
  if (scenario.pass.maxLagSec !== undefined) {
    goal += `, with queued work never more than ${scenario.pass.maxLagSec}s behind`;
  }
  return `${goal}.`;
}

const PLAIN_FAILURE: Record<
  string,
  (f: VerdictFailure, s: Scenario) => string
> = {
  p95: (f, s) =>
    `Responses got too slow: p95 stayed above ${s.pass.p95Ms} ms for too long, starting at ${formatSec(f.atSec)}.`,
  "error-rate": (f, s) =>
    `Too many requests failed: errors went over ${formatBudgetPct(s.pass.maxErrorRate)} at ${formatSec(f.atSec)}.`,
  "kill-survival": (f, s) =>
    `Losing a server hurt users: errors went over ${formatBudgetPct(s.pass.maxErrorRate)} at ${formatSec(f.atSec)}, right after it went down.`,
  consistency: () =>
    "Some reads can return stale data, but this scenario needs strong consistency.",
  lag: (f, s) =>
    `Background work fell behind: queue lag went over ${s.pass.maxLagSec}s at ${formatSec(f.atSec)}.`,
};

export const PLAIN_CAPACITY_TIP =
  "Look at the canvas: red nodes ran out of capacity, grey ones went down. Select a node to change its settings.";

/** Request count → "950", "9k", "12.3k" (k-suffix at/above 1000, no trailing ".0"). */
export function formatCount(n: number): string {
  return n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : `${Math.round(n)}`;
}

const ERROR_CRITERIA = new Set(["error-rate", "kill-survival"]);

/** Breaker trips worth explaining: the run failed on errors and a breaker failed calls fast. */
export function breakerTripsBehindErrors(verdict: Verdict): BreakerTrip[] {
  if (verdict.passed) return [];
  if (!verdict.failures.some((f) => ERROR_CRITERIA.has(f.criterion))) return [];
  return Array.isArray(verdict.breakerTrips) ? verdict.breakerTrips : [];
}

/** One sentence crediting the breaker and naming the remaining fix. */
export function describeBreakerTrip(trip: BreakerTrip): string {
  const n = formatCount(trip.failedFast);
  const fix = `Add capacity to ${trip.targetLabel} so it doesn't trip.`;
  return trip.recoveredAtSec === null
    ? `Your breaker protected ${trip.targetLabel}, but it was still open when the run ended: ${n} requests failed fast. ${fix}`
    : `Your breaker protected ${trip.targetLabel} (recovered at ${formatSec(trip.recoveredAtSec)}), but ${n} requests failed fast while it was open. ${fix}`;
}

/**
 * Quick mode's plain-language verdict lines (the headline stays describeRunStatus's
 * "Passed"/"Failed"). Unknown criteria fall back to the engine's detail string.
 * Advisories are omitted: they're grader hints. A failure on errors with
 * breaker trips adds one line per trip, which replaces the capacity tip.
 */
export function describeVerdictPlainly(
  verdict: Verdict,
  scenario: Scenario,
  /** sim seconds actually run; a pass on a run stopped early isn't a full pass */
  ranSec?: number,
): string[] {
  if (verdict.passed) {
    if (ranSec !== undefined && ranSec < scenario.durationSec - 0.05) {
      return [
        `Stopped at ${formatSec(ranSec)} of ${scenario.durationSec}s. So far p95 stayed under ${scenario.pass.p95Ms} ms and errors under ${formatBudgetPct(scenario.pass.maxErrorRate)}. Let the run finish for the full result.`,
      ];
    }
    return [
      `Your design handled “${scenario.name}”: p95 stayed under ${scenario.pass.p95Ms} ms and errors under ${formatBudgetPct(scenario.pass.maxErrorRate)}.`,
    ];
  }
  const lines = verdict.failures.map(
    (f) => PLAIN_FAILURE[f.criterion]?.(f, scenario) ?? f.detail,
  );
  const breakerLines = breakerTripsBehindErrors(verdict).map(describeBreakerTrip);
  lines.push(...breakerLines);
  if (
    breakerLines.length === 0 &&
    verdict.failures.some((f) => f.criterion !== "consistency")
  ) {
    lines.push(PLAIN_CAPACITY_TIP);
  }
  return [...new Set(lines)];
}
