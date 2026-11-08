import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequirementItem, Scenario } from "../src/lib/core";
import type { DesignMode } from "../src/persistence/local";
import { useDesignStore } from "../src/stores/design-store";
import { useScenarioStore } from "../src/stores/scenario-store";
import {
  dropIndex,
  nfrRequirementTexts,
  seedNonFunctionalOnce,
} from "../src/components/boards/requirements";

function scenarioFixture(overrides: Partial<Scenario["pass"]> = {}): Scenario {
  return {
    id: "s1",
    name: "Fixture",
    description: "",
    durationSec: 60,
    baseRps: 5000,
    readRatio: 0.8,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01, ...overrides },
    seed: 1,
  };
}

function createStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

function attach(
  id: string,
  nonFunctional: RequirementItem[] = [],
  mode: DesignMode = "practice",
) {
  const s = useDesignStore.getState();
  useDesignStore.setState({
    designId: id,
    designMode: mode,
    actionLog: [],
    boards: {
      ...s.boards,
      requirements: { functional: [], nonFunctional, nonFunctionalSeeded: false },
    },
  });
}

const requirements = () => useDesignStore.getState().boards.requirements;

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("nfrRequirementTexts", () => {
  it("renders one line per scenario NFR (eventual by default)", () => {
    expect(nfrRequirementTexts(scenarioFixture())).toEqual([
      "Target load: 5000 RPS",
      "p95 latency budget: 200 ms",
      "Max error rate: 1%",
      "Consistency: Eventual",
    ]);
  });

  it("includes lag when present, strong consistency and a fractional error rate, in order", () => {
    expect(
      nfrRequirementTexts(
        scenarioFixture({ maxErrorRate: 0.005, consistency: "strong", maxLagSec: 30 }),
      ),
    ).toEqual([
      "Target load: 5000 RPS",
      "p95 latency budget: 200 ms",
      "Max error rate: 0.5%",
      "Max consumer lag: 30s",
      "Consistency: Strong",
    ]);
  });
});

describe("seedNonFunctionalOnce", () => {
  it("sets the seeded flag and gives items unique string ids", () => {
    useScenarioStore.getState().setScenario(scenarioFixture());
    attach("seed-0");
    expect(seedNonFunctionalOnce("seed-0")).toBe(true);
    const { nonFunctional, nonFunctionalSeeded } = requirements();
    expect(nonFunctionalSeeded).toBe(true);
    const ids = nonFunctional.map((i) => i.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("seeds values that match the scenario, tagged as scenario", () => {
    const scenario = scenarioFixture({ maxLagSec: 10 });
    useScenarioStore.getState().setScenario(scenario);
    attach("seed-1");
    expect(seedNonFunctionalOnce("seed-1")).toBe(true);
    const { functional, nonFunctional } = requirements();
    expect(nonFunctional.map((i) => i.text)).toEqual(nfrRequirementTexts(scenario));
    expect(nonFunctional.every((i) => i.source === "scenario")).toBe(true);
    expect(functional).toEqual([]);
  });

  it("does not re-seed after the user empties the list, in the session or after a reload", () => {
    vi.useFakeTimers();
    useScenarioStore.getState().setScenario(scenarioFixture({ maxLagSec: 10 }));
    attach("seed-2");
    expect(seedNonFunctionalOnce("seed-2")).toBe(true);
    for (const { id } of requirements().nonFunctional) {
      useDesignStore.getState().removeRequirement("nonFunctional", id);
    }
    expect(requirements().nonFunctional).toEqual([]);
    expect(seedNonFunctionalOnce("seed-2")).toBe(false);
    expect(requirements().nonFunctional).toEqual([]);

    vi.advanceTimersByTime(600);
    useDesignStore.getState().attachDesign("seed-2");
    expect(requirements().nonFunctionalSeeded).toBe(true);
    expect(seedNonFunctionalOnce("seed-2")).toBe(false);
    expect(requirements().nonFunctional).toEqual([]);
  });

  it("never seeds a list that was non-empty at attach, even once emptied", () => {
    useScenarioStore.getState().setScenario(scenarioFixture());
    attach("seed-3", [{ id: "x", text: "Mine" }]);
    expect(seedNonFunctionalOnce("seed-3")).toBe(false);
    expect(requirements().nonFunctional).toEqual([{ id: "x", text: "Mine" }]);
    useDesignStore.getState().removeRequirement("nonFunctional", "x");
    expect(seedNonFunctionalOnce("seed-3")).toBe(false);
    expect(requirements().nonFunctional).toEqual([]);
  });

  it("ignores a design that isn't attached, and Quick designs", () => {
    useScenarioStore.getState().setScenario(scenarioFixture());
    attach("seed-4");
    expect(seedNonFunctionalOnce("other")).toBe(false);
    expect(requirements().nonFunctional).toEqual([]);

    attach("seed-5", [], "quick");
    expect(seedNonFunctionalOnce("seed-5")).toBe(false);
    expect(requirements().nonFunctional).toEqual([]);
  });

  it("records no action (seeding isn't a user edit)", () => {
    vi.useFakeTimers();
    useScenarioStore.getState().setScenario(scenarioFixture({ maxLagSec: 10 }));
    attach("seed-6");
    expect(seedNonFunctionalOnce("seed-6")).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(useDesignStore.getState().actionLog).toEqual([]);
  });
});

describe("dropIndex", () => {
  it("maps a drop gap to the item's final index", () => {
    expect(dropIndex(0, 2)).toBe(1);
    expect(dropIndex(2, 0)).toBe(0);
    expect(dropIndex(1, 1)).toBe(1);
    expect(dropIndex(1, 2)).toBe(1);
    expect(dropIndex(0, 3)).toBe(2);
  });
});
