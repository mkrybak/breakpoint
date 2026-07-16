import type { NodeState } from "@/lib/core";

/**
 * State → accent color (03-simulation-engine "Node states"). `overloaded` shares
 * the saturated red; the node adds a pulse on top. `down` is gray.
 */
export const STATE_COLOR: Record<NodeState, string> = {
  ok: "#22c55e", // green-500
  hot: "#f59e0b", // amber-500
  saturated: "#ef4444", // red-500
  overloaded: "#ef4444", // red-500
  down: "#6b7280", // gray-500
};

/** Live edge stroke width in px, log-scaled by traffic (rps). Idle → 1.5, capped at 6. */
export function edgeWidth(rps: number): number {
  if (rps <= 0) return 1.5;
  return Math.min(6, 1.5 + Math.log10(rps + 1) * 1.1);
}

/**
 * Dash-flow animation period in seconds; smaller = faster (speed ∝ rps). Returns 0
 * for idle edges, which the caller reads as "no animation". Floored at 0.3s.
 */
export function edgeDashDuration(rps: number): number {
  if (rps <= 0) return 0;
  return Math.max(0.3, 3 / (0.5 + Math.log10(rps + 1)));
}

/** Compact count for the queue badge: 1250 → "1.2k", 500 → "500". */
export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
}
