import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignGraph, RunResult, Scenario } from "../src/lib/core";
import {
  getQuickChallenge,
  getQuickScenario,
  QUICK_CHALLENGES,
  QUICK_SCENARIOS,
  SCENARIO_PRESETS,
} from "../src/lib/scenarios";
import { runSimulation } from "../src/lib/simulation";
import { starterGraph } from "../src/components/quick/starter";
import {
  loadSolvedChallenges,
  markChallengeSolved,
  parseSolvedChallenges,
  SOLVED_CHALLENGES_KEY,
} from "../src/persistence/challenges";
import {
  challengeSolvedBy,
  describeNudge,
  nextUnsolvedChallenge,
  type NudgeInput,
} from "../src/components/quick/challenge-nudge";

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

const CHALLENGE_IDS = [
  "quick-spike-3x",
  "quick-lose-app-server",
  "quick-black-friday",
  "quick-celebrity-tweet",
];

const scenario = (id: string): Scenario => getQuickScenario(id)!;

function withReplicas(n: number): DesignGraph {
  const g = starterGraph();
  g.nodes.find((x) => x.id === "app")!.config.replicas = n;
  return g;
}

/** Client → CDN → App server (1 replica) → SQL database */
function withCdn(): DesignGraph {
  const g = starterGraph();
  g.nodes.push({
    id: "cdn",
    kind: "cdn",
    label: "CDN",
    position: { x: 140, y: 0 },
    config: { hitRate: 0.9 },
  });
  g.edges = [
    {
      id: "e-client-cdn",
      source: "client",
      target: "cdn",
      callsPerRequest: 1,
      kind: "sync",
    },
    {
      id: "e-cdn-app",
      source: "cdn",
      target: "app",
      callsPerRequest: 1,
      kind: "sync",
    },
    ...g.edges.filter((e) => e.id !== "e-client-app"),
  ];
  return g;
}

function fakeResult(
  s: Scenario,
  passed: boolean,
  frameCount = s.durationSec * 10,
): RunResult {
  return {
    scenarioId: s.id,
    designSnapshot: starterGraph(),
    frames: Array.from({ length: frameCount }, (_, i) => ({
      t: i / 10,
      perNode: {},
      perEdge: {},
      p95Ms: 0,
      errorRate: 0,
      servedRps: 0,
      asyncDroppedRps: 0,
      maxLagSec: 0,
      events: [],
    })),
    verdict: { passed, failures: [], advisories: [] },
  };
}

describe("challenge data", () => {
  it("lists the four challenges in order, each backed by a Quick-only scenario", () => {
    expect(QUICK_CHALLENGES.map((c) => c.scenarioId)).toEqual(CHALLENGE_IDS);
    expect(QUICK_SCENARIOS.map((s) => s.id)).toEqual([
      "starter",
      ...CHALLENGE_IDS,
    ]);
    const presetIds = new Set(SCENARIO_PRESETS.map((s) => s.id));
    for (const c of QUICK_CHALLENGES) {
      expect(getQuickScenario(c.scenarioId)).toBeDefined();
      expect(presetIds.has(c.scenarioId)).toBe(false);
      expect(c.goal.length).toBeGreaterThan(0);
      expect(c.goal).not.toContain("\n");
      expect(c.hint).toBeDefined();
    }
    expect(getQuickChallenge("starter")).toBeUndefined();
    expect(getQuickChallenge("quick-spike-3x")).toBe(QUICK_CHALLENGES[0]);
  });
});

describe("challenge balance (engine)", () => {
  it("the demo holds: the bare starter goes red on the 3× spike, two replicas pass", () => {
    const fail = runSimulation(starterGraph(), scenario("quick-spike-3x"));
    expect(fail.verdict.passed).toBe(false);
    expect(fail.frames.some((f) => f.perNode.app?.state === "overloaded")).toBe(
      true,
    );
    const pass = runSimulation(withReplicas(2), scenario("quick-spike-3x"));
    expect(pass.verdict.passed).toBe(true);
    expect(pass.frames.length).toBe(300);
  });

  it.each([
    ["quick-spike-3x", [1], withReplicas(2)],
    ["quick-lose-app-server", [1, 2], withReplicas(3)],
    ["quick-black-friday", [1, 3], withReplicas(4)],
    ["quick-celebrity-tweet", [1, 4], withReplicas(5)],
  ] as const)(
    "%s: the bare starter fails, a reasonable design beats it",
    (id, failing, passingGraph) => {
      const s = scenario(id);
      for (const n of failing) {
        const r = runSimulation(withReplicas(n), s);
        expect(r.verdict.passed, `${n} replicas`).toBe(false);
        expect(r.frames.length).toBe(s.durationSec * 10);
      }
      const r = runSimulation(passingGraph, s);
      expect(r.verdict.passed).toBe(true);
      expect(r.frames.length).toBe(s.durationSec * 10);
    },
  );

  it("a CDN beats the read-heavy challenges but not the kill", () => {
    expect(
      runSimulation(withCdn(), scenario("quick-black-friday")).verdict.passed,
    ).toBe(true);
    expect(
      runSimulation(withCdn(), scenario("quick-celebrity-tweet")).verdict
        .passed,
    ).toBe(true);
    expect(
      runSimulation(withCdn(), scenario("quick-lose-app-server")).verdict
        .passed,
    ).toBe(false);
  });
});

describe("solved-state persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads [] from empty storage, marks idempotently, appends in order", () => {
    expect(loadSolvedChallenges()).toEqual([]);
    expect(markChallengeSolved("quick-spike-3x")).toEqual(["quick-spike-3x"]);
    expect(localStorage.getItem(SOLVED_CHALLENGES_KEY)).toBe(
      JSON.stringify(["quick-spike-3x"]),
    );
    expect(markChallengeSolved("quick-spike-3x")).toEqual(["quick-spike-3x"]);
    expect(markChallengeSolved("quick-lose-app-server")).toEqual([
      "quick-spike-3x",
      "quick-lose-app-server",
    ]);
    expect(loadSolvedChallenges()).toEqual([
      "quick-spike-3x",
      "quick-lose-app-server",
    ]);
  });

  it("parses forgivingly", () => {
    expect(parseSolvedChallenges("nope")).toEqual([]);
    expect(parseSolvedChallenges("{}")).toEqual([]);
    expect(parseSolvedChallenges("null")).toEqual([]);
    expect(parseSolvedChallenges('["a",1,"b","a"]')).toEqual(["a", "b"]);
  });

  it("works without localStorage (node)", () => {
    vi.unstubAllGlobals();
    expect(loadSolvedChallenges()).toEqual([]);
    expect(() => markChallengeSolved("x")).not.toThrow();
    expect(markChallengeSolved("x")).toEqual(["x"]);
  });
});

describe("challengeSolvedBy", () => {
  const spike = scenario("quick-spike-3x");

  it("returns the challenge for a full-length pass", () => {
    expect(
      challengeSolvedBy(QUICK_CHALLENGES, fakeResult(spike, true), spike),
    ).toBe(QUICK_CHALLENGES[0]);
  });

  it("returns null for a fail, an early stop, a non-challenge, no result, or a mismatched scenario", () => {
    expect(
      challengeSolvedBy(QUICK_CHALLENGES, fakeResult(spike, false), spike),
    ).toBeNull();
    expect(
      challengeSolvedBy(QUICK_CHALLENGES, fakeResult(spike, true, 20), spike),
    ).toBeNull();
    const starter = scenario("starter");
    expect(
      challengeSolvedBy(QUICK_CHALLENGES, fakeResult(starter, true), starter),
    ).toBeNull();
    expect(challengeSolvedBy(QUICK_CHALLENGES, null, spike)).toBeNull();
    expect(
      challengeSolvedBy(
        QUICK_CHALLENGES,
        { ...fakeResult(spike, true), scenarioId: "other" },
        spike,
      ),
    ).toBeNull();
  });
});

describe("nextUnsolvedChallenge", () => {
  it("returns the first unsolved in order, honouring skip", () => {
    expect(nextUnsolvedChallenge(QUICK_CHALLENGES, [])).toBe(
      QUICK_CHALLENGES[0],
    );
    expect(nextUnsolvedChallenge(QUICK_CHALLENGES, ["quick-spike-3x"])).toBe(
      QUICK_CHALLENGES[1],
    );
    expect(
      nextUnsolvedChallenge(
        QUICK_CHALLENGES,
        ["quick-spike-3x"],
        "quick-lose-app-server",
      ),
    ).toBe(QUICK_CHALLENGES[2]);
    expect(nextUnsolvedChallenge(QUICK_CHALLENGES, CHALLENGE_IDS)).toBeNull();
  });
});

describe("describeNudge", () => {
  const base: Omit<
    NudgeInput,
    "scenarioId" | "status" | "result" | "runScenario"
  > = {
    challenges: QUICK_CHALLENGES,
    solved: [],
  };
  const starter = scenario("starter");
  const spike = scenario("quick-spike-3x");

  it("idle on the starter shows nothing", () => {
    expect(
      describeNudge({
        ...base,
        scenarioId: "starter",
        status: "idle",
        result: null,
        runScenario: null,
      }),
    ).toEqual({ kind: "none" });
  });

  it("a selected challenge is active, running or not", () => {
    const idle = describeNudge({
      ...base,
      scenarioId: "quick-spike-3x",
      status: "idle",
      result: null,
      runScenario: null,
    });
    expect(idle).toEqual({
      kind: "active",
      challenge: QUICK_CHALLENGES[0],
      running: false,
    });
    const running = describeNudge({
      ...base,
      scenarioId: "quick-spike-3x",
      status: "running",
      result: null,
      runScenario: spike,
    });
    expect(running).toMatchObject({ kind: "active", running: true });
  });

  it("after a starter run, suggests the first challenge", () => {
    const full = describeNudge({
      ...base,
      scenarioId: "starter",
      status: "done",
      result: fakeResult(starter, true),
      runScenario: starter,
    });
    expect(full).toMatchObject({ kind: "suggest", passed: true });
    expect(full.kind === "suggest" && full.next.scenarioId).toBe(
      "quick-spike-3x",
    );
    const stopped = describeNudge({
      ...base,
      scenarioId: "starter",
      status: "done",
      result: fakeResult(starter, true, 20),
      runScenario: starter,
    });
    expect(stopped).toMatchObject({ kind: "suggest", passed: false });
  });

  it("all solved → all-done", () => {
    expect(
      describeNudge({
        ...base,
        solved: CHALLENGE_IDS,
        scenarioId: "starter",
        status: "done",
        result: fakeResult(starter, true),
        runScenario: starter,
      }),
    ).toEqual({ kind: "all-done" });
  });

  it("a full-length pass on a challenge → solved, with the next one", () => {
    const solved = describeNudge({
      ...base,
      scenarioId: "quick-spike-3x",
      status: "done",
      result: fakeResult(spike, true),
      runScenario: spike,
    });
    expect(solved).toMatchObject({ kind: "solved" });
    expect(solved.kind === "solved" && solved.next?.scenarioId).toBe(
      "quick-lose-app-server",
    );
    const last = describeNudge({
      ...base,
      solved: CHALLENGE_IDS.slice(1),
      scenarioId: "quick-spike-3x",
      status: "done",
      result: fakeResult(spike, true),
      runScenario: spike,
    });
    expect(last).toEqual({
      kind: "solved",
      challenge: QUICK_CHALLENGES[0],
      next: null,
    });
  });

  it("a failed or stopped challenge run → retry", () => {
    expect(
      describeNudge({
        ...base,
        scenarioId: "quick-spike-3x",
        status: "done",
        result: fakeResult(spike, false),
        runScenario: spike,
      }),
    ).toEqual({
      kind: "retry",
      challenge: QUICK_CHALLENGES[0],
      stopped: false,
    });
    expect(
      describeNudge({
        ...base,
        scenarioId: "quick-spike-3x",
        status: "done",
        result: fakeResult(spike, true, 20),
        runScenario: spike,
      }),
    ).toEqual({ kind: "retry", challenge: QUICK_CHALLENGES[0], stopped: true });
  });

  it("a stale result for another scenario shows the selected challenge as active", () => {
    expect(
      describeNudge({
        ...base,
        scenarioId: "quick-black-friday",
        status: "done",
        result: fakeResult(spike, true),
        runScenario: spike,
      }),
    ).toEqual({
      kind: "active",
      challenge: QUICK_CHALLENGES[2],
      running: false,
    });
  });
});
