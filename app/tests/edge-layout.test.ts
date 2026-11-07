import { describe, expect, it } from "vitest";
import {
  chipFits,
  chipWidth,
  collapsedChip,
  edgeSpan,
  placePopover,
  POPOVER_SIZE,
  rectsOverlap,
} from "../src/components/canvas/edges/edge-layout";
import type { ChipSegment } from "../src/components/canvas/edges/edge-chip";

const seg = (key: string, text: string, tone = "muted") =>
  ({ key, text, tone }) as ChipSegment;

const SETTINGS = "⏱︎200 ↻3";

describe("edgeSpan", () => {
  it("measures the handle-to-handle distance", () => {
    expect(edgeSpan({ x: 179, y: 235 }, { x: 247, y: 235 })).toBe(68);
    expect(edgeSpan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("chipWidth", () => {
  it("is 6px per code point plus 12px padding, ignoring U+FE0E", () => {
    expect(chipWidth("×1")).toBe(24);
    expect(chipWidth(`×1 · ${SETTINGS}`)).toBe(84);
  });
});

describe("chipFits", () => {
  it("needs 10px of stroke each side", () => {
    expect(chipFits("×1", 68)).toBe(true);
    expect(chipFits(`×1 · ${SETTINGS}`, 68)).toBe(false);
    expect(chipFits(`×1 · ${SETTINGS}`, 98)).toBe(false);
    expect(chipFits("50% · auto", 98)).toBe(true);
  });

  it("is inclusive at the boundary", () => {
    expect(chipFits("abcd", 56)).toBe(true);
    expect(chipFits("abcd", 55)).toBe(false);
  });
});

describe("rectsOverlap", () => {
  it("is true for overlapping boxes", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ),
    ).toBe(true);
  });

  it("is false for boxes that only touch", () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 10, height: 10 },
      ),
    ).toBe(false);
  });
});

describe("placePopover", () => {
  it("moves below both nodes on retry-storm's short edge", () => {
    const endpoints = [
      { x: 250, y: 200, width: 176, height: 70 },
      { x: 500, y: 200, width: 176, height: 70 },
    ];
    expect(
      placePopover({ x: 463, y: 235 }, POPOVER_SIZE.call, endpoints),
    ).toEqual({ center: { x: 463, y: 294 }, displaced: true });
  });

  it("stays on a long edge", () => {
    const label = { x: 388.5, y: 35 };
    const endpoints = [
      { x: 0, y: 0, width: 176, height: 70 },
      { x: 600, y: 0, width: 176, height: 70 },
    ];
    expect(placePopover(label, POPOVER_SIZE.call, endpoints)).toEqual({
      center: label,
      displaced: false,
    });
  });

  it("goes under the lowest endpoint when staggered", () => {
    const endpoints = [
      { x: 0, y: 0, width: 176, height: 70 },
      { x: 250, y: 80, width: 176, height: 70 },
    ];
    const result = placePopover(
      { x: 213, y: 75 },
      POPOVER_SIZE.call,
      endpoints,
    );
    expect(result.displaced).toBe(true);
    expect(result.center.y).toBe(150 + 8 + 16);
  });

  it("stays put before nodes are measured", () => {
    expect(
      placePopover({ x: 10, y: 10 }, POPOVER_SIZE.split, []).displaced,
    ).toBe(false);
  });
});

describe("collapsedChip", () => {
  it("breaker open wins over everything", () => {
    expect(
      collapsedChip(
        [
          seg("base", "×1"),
          seg("breaker", "breaker open", "rose"),
          seg("amplification", "↻ 3.6× load", "amber"),
        ],
        3.63,
      ),
    ).toEqual({ icon: "shield-off", tone: "rose", text: "" });
  });

  it("breaker probing is an amber shield", () => {
    expect(
      collapsedChip(
        [seg("base", "×1"), seg("breaker", "breaker probing", "amber")],
        null,
      ),
    ).toEqual({ icon: "shield-alert", tone: "amber", text: "" });
  });

  it("hot amplification shows its value", () => {
    expect(
      collapsedChip(
        [
          seg("base", "×1"),
          seg("settings", SETTINGS),
          seg("amplification", "↻ 3.6× load", "amber"),
        ],
        3.63,
      ),
    ).toEqual({ icon: "repeat", tone: "amber", text: "3.6×" });
  });

  it("settings without hot amplification is a muted timer", () => {
    expect(
      collapsedChip(
        [
          seg("base", "×1"),
          seg("settings", SETTINGS),
          seg("amplification", "↻ 1.3× load"),
        ],
        1.3,
      ),
    ).toEqual({ icon: "timer", tone: "muted", text: "" });
    expect(
      collapsedChip([seg("base", "×1"), seg("settings", SETTINGS)], null),
    ).toEqual({ icon: "timer", tone: "muted", text: "" });
  });

  it("falls back to a muted ellipsis", () => {
    expect(
      collapsedChip(
        [seg("base", "×1"), seg("amplification", "↻ 1.3× load")],
        1.3,
      ),
    ).toEqual({ icon: "ellipsis", tone: "muted", text: "" });
    expect(
      collapsedChip([seg("base", "×1"), seg("breaker", "breaker")], null),
    ).toEqual({ icon: "ellipsis", tone: "muted", text: "" });
  });
});
