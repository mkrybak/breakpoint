import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/lib/simulation";

function sequence(seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => rng());
}

describe("mulberry32", () => {
  it("is deterministic: same seed → same sequence", () => {
    expect(sequence(42, 20)).toEqual(sequence(42, 20));
  });

  it("matches known output for seed 42", () => {
    expect(sequence(42, 5)).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
      0.6697340414393693, 0.17481389874592423,
    ]);
  });

  it("matches known output for seed 1", () => {
    expect(sequence(1, 5)).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
      0.9810509674716741, 0.9683778982143849,
    ]);
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(1, 5)).not.toEqual(sequence(2, 5));
  });

  it("always returns values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("two independent instances with the same seed never diverge", () => {
    const rngA = mulberry32(123);
    const rngB = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      expect(rngA()).toBe(rngB());
    }
  });
});
