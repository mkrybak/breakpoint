import type { EdgeFrame } from "@/lib/core";
import { isSplitSource } from "@/lib/registry";
import type { FlowEdgeData } from "@/stores/flow-adapter";

/** Rounded amplification strictly above this turns the segment amber. */
export const AMPLIFICATION_WARN = 1.5;

export type ChipTone = "muted" | "amber" | "rose";

export type ChipSegmentKey =
  | "base"
  | "auto"
  | "async"
  | "settings"
  | "breaker"
  | "amplification";

export interface ChipSegment {
  key: ChipSegmentKey;
  text: string;
  tone: ChipTone;
}

/** "⏱"-less timeout label: 200 → "200", 1500 → "1.5s", 2000 → "2s". */
export function formatTimeout(ms: number): string {
  const r = Math.round(ms);
  return r < 1000 ? `${r}` : `${Math.round(r / 100) / 10}s`;
}

/**
 * Attempts ÷ fresh calls on this frame (T-12.3): rps / (rps − retryRps).
 * null when the edge carried no retries, or fresh calls are ≈ 0.
 */
export function retryAmplification(frame: EdgeFrame | undefined): number | null {
  const retry = frame?.retryRps ?? 0;
  if (!frame || retry <= 0) return null;
  const fresh = frame.rps - retry;
  if (fresh <= 1e-9) return null;
  return frame.rps / fresh;
}

/** The unselected edge chip, as ordered segments (render joined by " · "). */
export function edgeChipSegments(
  data: FlowEdgeData | undefined,
  frame: EdgeFrame | undefined,
): ChipSegment[] {
  const isSplit = isSplitSource(data?.sourceKind);
  const share = data?.trafficShare ?? 1;
  const calls = data?.callsPerRequest ?? 1;
  const kind = data?.kind ?? "sync";
  const isAuto = isSplit && data?.autoShare !== false;
  const resilient = data?.supportsResilience === true;

  const segments: ChipSegment[] = [
    {
      key: "base",
      text: isSplit
        ? `${Math.round(share * 100)}%`
        : `×${Math.round(calls * 100) / 100}`,
      tone: "muted",
    },
  ];
  if (isAuto) segments.push({ key: "auto", text: "auto", tone: "muted" });
  if (kind === "async") segments.push({ key: "async", text: "async", tone: "muted" });

  if (resilient && data) {
    const parts: string[] = [];
    if (
      typeof data.timeoutMs === "number" &&
      Number.isFinite(data.timeoutMs) &&
      data.timeoutMs > 0
    ) {
      // U+FE0E: text presentation, so the stopwatch renders as a mono glyph, not a colour emoji
      parts.push(`⏱\uFE0E${formatTimeout(data.timeoutMs)}`);
    }
    const r = Math.round(data.retries ?? 0);
    if (r >= 1) parts.push(`↻${r}`);
    if (parts.length > 0) {
      segments.push({ key: "settings", text: parts.join(" "), tone: "muted" });
    }

    if (data.breaker !== undefined) {
      const phase = frame?.breaker;
      segments.push(
        phase === "open"
          ? { key: "breaker", text: "breaker open", tone: "rose" }
          : phase === "half-open"
            ? { key: "breaker", text: "breaker probing", tone: "amber" }
            : { key: "breaker", text: "breaker", tone: "muted" },
      );
    }
  }

  const amp = retryAmplification(frame);
  if (amp !== null) {
    const shown = Math.round(amp * 10) / 10;
    if (shown > 1) {
      segments.push({
        key: "amplification",
        text: `↻ ${shown.toFixed(1)}× load`,
        tone: shown > AMPLIFICATION_WARN ? "amber" : "muted",
      });
    }
  }

  return segments;
}
