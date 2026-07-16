import { describe, expect, it } from "vitest";
import {
  STATE_COLOR,
  edgeDashDuration,
  edgeWidth,
  formatCount,
} from "@/components/canvas/sim-visuals";

describe("STATE_COLOR", () => {
  it("covers every NodeState", () => {
    expect(Object.keys(STATE_COLOR).sort()).toEqual([
      "down",
      "hot",
      "ok",
      "overloaded",
      "saturated",
    ]);
  });
});

describe("edgeWidth", () => {
  it("is 1.5 for idle edges", () => {
    expect(edgeWidth(0)).toBe(1.5);
    expect(edgeWidth(-5)).toBe(1.5);
  });
  it("grows with traffic on a log scale", () => {
    expect(edgeWidth(9)).toBeCloseTo(2.6, 6);
  });
  it("caps at 6", () => {
    expect(edgeWidth(1e9)).toBe(6);
  });
});

describe("edgeDashDuration", () => {
  it("is 0 for idle edges (caller disables animation)", () => {
    expect(edgeDashDuration(0)).toBe(0);
  });
  it("is faster (smaller) for more traffic", () => {
    expect(edgeDashDuration(9)).toBeCloseTo(2, 6);
    expect(edgeDashDuration(999)).toBeLessThan(edgeDashDuration(9));
  });
  it("floors at 0.3s", () => {
    expect(edgeDashDuration(1e30)).toBe(0.3);
  });
});

describe("formatCount", () => {
  it("formats plain integers below 1000", () => {
    expect(formatCount(500)).toBe("500");
    expect(formatCount(0)).toBe("0");
  });
  it("uses k with one decimal at/above 1000", () => {
    expect(formatCount(1000)).toBe("1.0k");
    expect(formatCount(1250)).toBe("1.3k");
  });
});
