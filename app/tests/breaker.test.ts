import { describe, expect, it } from "vitest";
import type { DesignEdge } from "../src/lib/core";
import {
  beginBreakerTick,
  breakerEvent,
  CLOSED_BREAKER,
  DEFAULT_BREAKER,
  endBreakerTick,
  resolveBreaker,
  type BreakerState,
  type ResolvedBreaker,
} from "../src/lib/simulation/breaker";

function edge(overrides: Partial<DesignEdge> = {}): DesignEdge {
  return { id: "e", source: "a", target: "b", kind: "sync", ...overrides };
}

describe("resolveBreaker", () => {
  it("is null without a breaker and on an async edge", () => {
    expect(resolveBreaker(edge(), 10)).toBeNull();
    expect(
      resolveBreaker(edge({ kind: "async", breaker: DEFAULT_BREAKER }), 10),
    ).toBeNull();
  });

  it("converts DEFAULT_BREAKER seconds to ticks", () => {
    expect(resolveBreaker(edge({ breaker: DEFAULT_BREAKER }), 10)).toEqual({
      threshold: 0.5,
      tripTicks: 5,
      cooldownTicks: 50,
    });
  });

  it("clamps junk values and falls back to defaults for non-finite ones", () => {
    expect(
      resolveBreaker(
        edge({
          breaker: { errorThreshold: 2, tripAfterSec: 0.01, cooldownSec: NaN },
        }),
        10,
      ),
    ).toEqual({ threshold: 0.95, tripTicks: 1, cooldownTicks: 50 });
  });
});

describe("beginBreakerTick", () => {
  const cfg: ResolvedBreaker = { threshold: 0.5, tripTicks: 5, cooldownTicks: 50 };

  it("closed admits everything", () => {
    expect(beginBreakerTick(CLOSED_BREAKER, cfg)).toEqual({
      state: CLOSED_BREAKER,
      pass: 1,
      halfOpened: false,
    });
  });

  it("open admits nothing until the cooldown completes", () => {
    const begun = beginBreakerTick(
      { phase: "open", streak: 0, openTicks: 49 },
      cfg,
    );
    expect(begun.pass).toBe(0);
    expect(begun.halfOpened).toBe(false);
  });

  it("after the cooldown it half-opens and admits the probe fraction", () => {
    const begun = beginBreakerTick(
      { phase: "open", streak: 0, openTicks: 50 },
      cfg,
    );
    expect(begun.state.phase).toBe("half-open");
    expect(begun.pass).toBe(0.1);
    expect(begun.halfOpened).toBe(true);
  });
});

describe("endBreakerTick", () => {
  const cfg: ResolvedBreaker = { threshold: 0.5, tripTicks: 3, cooldownTicks: 50 };
  const fold = (rates: number[], start: BreakerState = CLOSED_BREAKER) => {
    let state = start;
    let transition: string | undefined;
    for (const rate of rates) {
      const ended = endBreakerTick(state, cfg, rate);
      state = ended.state;
      transition = ended.transition;
    }
    return { state, transition };
  };

  it("a healthy tick resets the streak", () => {
    expect(fold([1, 1, 0])).toEqual({
      state: { phase: "closed", streak: 0, openTicks: 0 },
      transition: undefined,
    });
  });

  it("opens on the Nth consecutive tick over the threshold", () => {
    expect(fold([1, 1])).toEqual({
      state: { phase: "closed", streak: 2, openTicks: 0 },
      transition: undefined,
    });
    expect(fold([1, 1, 1])).toEqual({
      state: { phase: "open", streak: 0, openTicks: 0 },
      transition: "open",
    });
  });

  it("exactly the threshold does not count (strictly above)", () => {
    expect(fold([0.5, 0.5, 0.5]).state).toEqual(CLOSED_BREAKER);
  });

  it("half-open re-opens on a failing probe and closes on a passing one", () => {
    const half: BreakerState = { phase: "half-open", streak: 0, openTicks: 0 };
    expect(endBreakerTick(half, cfg, 0.6)).toEqual({
      state: { phase: "open", streak: 0, openTicks: 0 },
      transition: "open",
    });
    expect(endBreakerTick(half, cfg, 0.5)).toEqual({
      state: CLOSED_BREAKER,
      transition: "closed",
    });
  });

  it("open counts its ticks with no transition", () => {
    expect(
      endBreakerTick({ phase: "open", streak: 0, openTicks: 7 }, cfg, 1),
    ).toEqual({ state: { phase: "open", streak: 0, openTicks: 8 } });
  });
});

describe("breakerEvent", () => {
  it("formats the three transition lines", () => {
    expect(breakerEvent("App", "DB", "open", 0.996)).toBe(
      "App → DB breaker open at 100% errors — failing fast",
    );
    expect(breakerEvent("App", "DB", "half-open")).toBe(
      "App → DB breaker half-open — probing",
    );
    expect(breakerEvent("App", "DB", "closed")).toBe(
      "App → DB breaker closed — traffic restored",
    );
  });
});
