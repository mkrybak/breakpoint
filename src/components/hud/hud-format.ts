import type { RunResult } from "@/lib/core";
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
