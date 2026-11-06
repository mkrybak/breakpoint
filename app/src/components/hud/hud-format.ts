import type { RunResult, Scenario, Verdict, VerdictFailure } from "@/lib/core";
import type { SimStatus } from "@/stores/sim-store";

/** p95 latency → "142 ms". */
export function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

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
 * label: "overloaded"/"shedding load"/trailing " down" → critical, "saturated"/
 * "running hot" → warning, "recovered" → good, anything else → info.
 */
export function classifyLogSeverity(message: string): LogSeverity {
  if (/overloaded|shedding load| down$/.test(message)) return "critical";
  if (/saturated|running hot/.test(message)) return "warning";
  if (/recovered/.test(message)) return "recovered";
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

/** Quick mode's read-only goal line, e.g. "Keep p95 under 200 ms and errors under 1%." */
export function describeScenarioGoal(scenario: Scenario): string {
  let goal = `Keep p95 under ${scenario.pass.p95Ms} ms and errors under ${formatBudgetPct(scenario.pass.maxErrorRate)}`;
  if ((scenario.pass.minSurvivedKills ?? 0) >= 1) {
    goal += ", even when a server goes down";
  }
  if (scenario.pass.consistency === "strong") {
    goal += ", with strongly consistent reads";
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
};

export const PLAIN_CAPACITY_TIP =
  "Look at the canvas: red nodes ran out of capacity, grey ones went down. Select a node to change its settings.";

/**
 * Quick mode's plain-language verdict lines (the headline stays describeRunStatus's
 * "Passed"/"Failed"). Unknown criteria fall back to the engine's detail string.
 * Advisories are omitted: they're grader hints.
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
  if (verdict.failures.some((f) => f.criterion !== "consistency")) {
    lines.push(PLAIN_CAPACITY_TIP);
  }
  return [...new Set(lines)];
}
