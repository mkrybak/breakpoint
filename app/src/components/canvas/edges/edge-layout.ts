import type { ChipSegment, ChipTone } from "./edge-chip";

/** A point or box in React Flow's flow coordinates (zoom-independent). */
export interface FlowPoint {
  x: number;
  y: number;
}
export interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 10px Geist Mono advance (0.6em) and the chip's px-1.5 padding. */
export const CHIP_CHAR_PX = 6;
export const CHIP_PAD_PX = 12;
/** Stroke (or arrowhead) that must stay visible on each side of the chip. */
export const MIN_VISIBLE_STROKE_PX = 10;
/** Estimated open edge editor (T-8.3 popover) box, flow px. */
export const POPOVER_SIZE = {
  call: { width: 210, height: 32 },
  split: { width: 250, height: 32 },
} as const;
/** Gap between the displaced popover and the nodes above it. */
export const POPOVER_GAP_PX = 8;

/** Straight-line length between the edge's handle points. */
export function edgeSpan(source: FlowPoint, target: FlowPoint): number {
  return Math.hypot(target.x - source.x, target.y - source.y);
}

/** Estimated rendered width of the chip for this text (U+FE0E variation selectors have no width). */
export function chipWidth(text: string): number {
  return [...text.replaceAll("︎", "")].length * CHIP_CHAR_PX + CHIP_PAD_PX;
}

/** True when the full chip fits with ≥ MIN_VISIBLE_STROKE_PX of stroke on both sides. */
export function chipFits(text: string, span: number): boolean {
  return chipWidth(text) + 2 * MIN_VISIBLE_STROKE_PX <= span;
}

/** Strict overlap: touching edges don't count. */
export function rectsOverlap(a: FlowRect, b: FlowRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * Centre point for the open edge editor. On the label point unless that box
 * overlaps an endpoint node; then centred under the lowest endpoint's bottom.
 */
export function placePopover(
  label: FlowPoint,
  size: { width: number; height: number },
  endpoints: FlowRect[],
): { center: FlowPoint; displaced: boolean } {
  const box: FlowRect = {
    x: label.x - size.width / 2,
    y: label.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
  if (!endpoints.some((r) => rectsOverlap(box, r))) {
    return { center: label, displaced: false };
  }
  const bottom = Math.max(...endpoints.map((r) => r.y + r.height));
  return {
    center: { x: label.x, y: bottom + POPOVER_GAP_PX + size.height / 2 },
    displaced: true,
  };
}

export type CollapsedIcon =
  "shield-off" | "shield-alert" | "repeat" | "timer" | "ellipsis";

export interface CollapsedChip {
  icon: CollapsedIcon;
  tone: ChipTone;
  /** "" except the amplification value, e.g. "3.6×". */
  text: string;
}

/**
 * The icon a too-long chip collapses to: its most urgent segment wins.
 * Breaker open > probing > hot amplification > resilience settings > ellipsis.
 */
export function collapsedChip(
  segments: ChipSegment[],
  amplification: number | null,
): CollapsedChip {
  const breaker = segments.find((s) => s.key === "breaker");
  if (breaker?.tone === "rose") {
    return { icon: "shield-off", tone: "rose", text: "" };
  }
  if (breaker?.tone === "amber") {
    return { icon: "shield-alert", tone: "amber", text: "" };
  }
  const amp = segments.find((s) => s.key === "amplification");
  if (amp?.tone === "amber" && amplification !== null) {
    return {
      icon: "repeat",
      tone: "amber",
      text: `${(Math.round(amplification * 10) / 10).toFixed(1)}×`,
    };
  }
  // a collapsed chip must not hide that the edge has timeout/retries (lead call)
  if (segments.some((s) => s.key === "settings")) {
    return { icon: "timer", tone: "muted", text: "" };
  }
  return { icon: "ellipsis", tone: "muted", text: "" };
}
