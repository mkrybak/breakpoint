import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunResult, Scenario } from "../src/lib/core";
import type { DesignGraph } from "../src/lib/core";
import { emptyScorecard } from "../src/lib/grading";
import {
  buildDesignRecord,
  buildRunBundle,
  DEFAULT_DESIGN_MODE,
  deleteDesign,
  designStorageKey,
  exportDesignFile,
  listDesigns,
  loadDesign,
  parseDesignRecord,
  parseRunBundle,
  renameDesign,
  saveDesign,
  type DesignMode,
  type DesignRecord,
} from "../src/persistence/local";
import { scorecardStorageKey } from "../src/persistence/scorecard";
import { phaseClockStorageKey } from "../src/persistence/phase-clock";

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

function fixtureGraph(): DesignGraph {
  return {
    nodes: [
      {
        id: "n-client",
        kind: "client",
        label: "Client",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n-app",
        kind: "app_server",
        label: "App server",
        position: { x: 200, y: 0 },
        config: { replicas: 2 },
      },
    ],
    edges: [
      {
        id: "e-client-app",
        source: "n-client",
        target: "n-app",
        callsPerRequest: 1,
        kind: "sync",
      },
    ],
    entryNodeId: "n-client",
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildDesignRecord", () => {
  it("stubs the fields nothing produces before M4", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    expect(record.id).toBe("d1");
    expect(record.name).toBe("My design");
    expect(record.scenarioId).toBe("");
    expect(record.actionLog).toEqual([]);
    expect(record.phaseNotes).toEqual({
      requirements: "",
      entities: "",
      api: "",
      hld: "",
      deepdive: "",
    });
    expect(new Date(record.updatedAt).getTime()).not.toBeNaN();
  });

  it("carries a provided phaseNotes map", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice", {
      requirements: "reqs",
      entities: "",
      api: "",
      hld: "",
      deepdive: "",
    });
    expect(record.phaseNotes.requirements).toBe("reqs");
  });

  it("carries a provided actionLog", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice", undefined, [
      { t: 3, phase: "hld", kind: "sim_run", detail: "ran X" },
    ]);
    expect(record.actionLog).toHaveLength(1);
    expect(record.actionLog[0]).toMatchObject({ kind: "sim_run" });
  });
});

describe("saveDesign / loadDesign", () => {
  it("round-trips a record through localStorage", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    saveDesign(record);
    expect(localStorage.getItem(designStorageKey("d1"))).not.toBeNull();
    expect(loadDesign("d1")).toEqual(record);
  });

  it("returns null for an unknown id", () => {
    expect(loadDesign("nope")).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.unstubAllGlobals();
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    expect(() => saveDesign(record)).not.toThrow();
    expect(() => loadDesign("d1")).not.toThrow();
  });
});

describe("parseDesignRecord", () => {
  it("accepts its own export shape", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    expect(parseDesignRecord(JSON.stringify(record))).toEqual(record);
  });

  it("rejects invalid JSON and non-record values", () => {
    expect(parseDesignRecord("not json{")).toBeNull();
    expect(parseDesignRecord('"just a string"')).toBeNull();
    expect(parseDesignRecord("[]")).toBeNull();
    expect(parseDesignRecord("{}")).toBeNull();
  });

  it("rejects a graph with an unknown node kind", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    const raw = JSON.parse(JSON.stringify(record)) as {
      graph: { nodes: { kind: string }[] };
    };
    raw.graph.nodes[0].kind = "mainframe";
    expect(parseDesignRecord(JSON.stringify(raw))).toBeNull();
  });

  it("rejects a graph missing entryNodeId or with a bad edge kind", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    const noEntry = JSON.parse(JSON.stringify(record)) as {
      graph: { entryNodeId?: string };
    };
    delete noEntry.graph.entryNodeId;
    expect(parseDesignRecord(JSON.stringify(noEntry))).toBeNull();

    const badEdge = JSON.parse(JSON.stringify(record)) as {
      graph: { edges: { kind: string }[] };
    };
    badEdge.graph.edges[0].kind = "carrier-pigeon";
    expect(parseDesignRecord(JSON.stringify(badEdge))).toBeNull();
  });

  it("fills defaults for missing non-graph fields", () => {
    const minimal = {
      id: "d1",
      name: "Bare file",
      graph: fixtureGraph(),
    };
    const record = parseDesignRecord(JSON.stringify(minimal));
    expect(record).not.toBeNull();
    expect(record?.scenarioId).toBe("");
    expect(record?.mode).toBe("practice");
    expect(record?.actionLog).toEqual([]);
    expect(record?.phaseNotes.requirements).toBe("");
    expect(new Date(record?.updatedAt ?? "").getTime()).not.toBeNaN();
  });

  it("keeps valid phase notes and drops invalid actionLog entries", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), "practice");
    record.phaseNotes.api = "GET /tweets";
    const raw = {
      ...record,
      actionLog: [
        { t: 1, phase: "hld", kind: "node_added", detail: "added Client" },
        { t: "not-a-number", phase: "hld", kind: "node_added", detail: "" },
        "garbage",
      ],
    };
    const parsed = parseDesignRecord(JSON.stringify(raw));
    expect(parsed?.phaseNotes.api).toBe("GET /tweets");
    expect(parsed?.actionLog).toEqual([
      { t: 1, phase: "hld", kind: "node_added", detail: "added Client" },
    ]);
  });
});

function recordAt(id: string, name: string, updatedAt: string): DesignRecord {
  return {
    id,
    name,
    mode: "practice",
    scenarioId: "",
    graph: fixtureGraph(),
    phaseNotes: {
      requirements: "",
      entities: "",
      api: "",
      hld: "",
      deepdive: "",
    },
    actionLog: [],
    updatedAt,
  };
}

describe("listDesigns", () => {
  it("returns [] when empty and when localStorage is unavailable", () => {
    expect(listDesigns()).toEqual([]);
    vi.unstubAllGlobals();
    expect(listDesigns()).toEqual([]);
  });

  it("returns saved designs newest-first, ignoring foreign and broken keys", () => {
    saveDesign(recordAt("old", "Old", "2026-01-01T00:00:00.000Z"));
    saveDesign(recordAt("new", "New", "2026-06-01T00:00:00.000Z"));
    localStorage.setItem(scorecardStorageKey("new"), "{}"); // foreign prefix
    localStorage.setItem(designStorageKey("bad"), "not json{"); // unparseable

    const ids = listDesigns().map((d) => d.id);
    expect(ids).toEqual(["new", "old"]);
  });
});

describe("deleteDesign", () => {
  it("removes the design, its scorecard and its phase clock", () => {
    saveDesign(recordAt("d1", "D1", "2026-01-01T00:00:00.000Z"));
    localStorage.setItem(scorecardStorageKey("d1"), "{}");
    localStorage.setItem(phaseClockStorageKey("d1"), "{}");

    deleteDesign("d1");

    expect(localStorage.getItem(designStorageKey("d1"))).toBeNull();
    expect(localStorage.getItem(scorecardStorageKey("d1"))).toBeNull();
    expect(localStorage.getItem(phaseClockStorageKey("d1"))).toBeNull();
  });

  it("does not throw without localStorage", () => {
    vi.unstubAllGlobals();
    expect(() => deleteDesign("d1")).not.toThrow();
  });
});

describe("renameDesign", () => {
  it("renames, bumps updatedAt, and persists", () => {
    saveDesign(recordAt("d1", "Old name", "2026-01-01T00:00:00.000Z"));

    const updated = renameDesign("d1", "  New name  ");

    expect(updated?.name).toBe("New name");
    expect(updated?.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(loadDesign("d1")?.name).toBe("New name");
  });

  it("returns null for an unknown id or a blank name", () => {
    saveDesign(recordAt("d1", "Keep", "2026-01-01T00:00:00.000Z"));
    expect(renameDesign("nope", "x")).toBeNull();
    expect(renameDesign("d1", "   ")).toBeNull();
    expect(loadDesign("d1")?.name).toBe("Keep"); // unchanged
  });
});

function fixtureScenario(): Scenario {
  return {
    id: "s1",
    name: "Test scenario",
    description: "fixture",
    durationSec: 10,
    baseRps: 100,
    readRatio: 0.5,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01 },
    seed: 1,
  };
}

function fixtureResult(): RunResult {
  return {
    scenarioId: "s1",
    designSnapshot: fixtureGraph(),
    frames: [
      { t: 0, perNode: {}, perEdge: {}, p95Ms: 10, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: [] },
      { t: 0.1, perNode: {}, perEdge: {}, p95Ms: 12, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: ["tick"] },
    ],
    verdict: { passed: true, failures: [], advisories: [] },
  };
}

describe("parseRunBundle", () => {
  it("round-trips a bundle → identical replay frames", () => {
    const bundle = buildRunBundle(
      buildDesignRecord("d1", "My design", fixtureGraph(), "practice"),
      fixtureScenario(),
      fixtureResult(),
      emptyScorecard(),
    );
    const parsed = parseRunBundle(JSON.stringify(bundle, null, 2));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // frames survive verbatim → replaying the import is identical to the export
      expect(parsed.bundle.result.frames).toEqual(bundle.result.frames);
      expect(parsed.bundle).toEqual(bundle);
    }
  });

  it("omits scorecard when the bundle has none", () => {
    const bundle = buildRunBundle(
      buildDesignRecord("d1", "My design", fixtureGraph(), "practice"),
      fixtureScenario(),
      fixtureResult(),
    );
    expect("scorecard" in bundle).toBe(false);
    const parsed = parseRunBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle.scorecard).toBeUndefined();
  });

  it("rejects malformed bundles with a readable error", () => {
    const good = buildRunBundle(
      buildDesignRecord("d1", "My design", fixtureGraph(), "practice"),
      fixtureScenario(),
      fixtureResult(),
    );

    const notJson = parseRunBundle("not json{");
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.error).toMatch(/JSON/i);

    const wrongVersion = parseRunBundle(JSON.stringify({ ...good, version: 2 }));
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.error).toMatch(/version/i);

    // corrupt only the result's design snapshot → the RunResult guard rejects it
    const badResultRaw = JSON.parse(JSON.stringify(good)) as {
      result: { designSnapshot: { nodes: { kind: string }[] } };
    };
    badResultRaw.result.designSnapshot.nodes[0].kind = "mainframe";
    const badResult = parseRunBundle(JSON.stringify(badResultRaw));
    expect(badResult.ok).toBe(false);
    if (!badResult.ok) expect(badResult.error).toMatch(/result/i);

    const badScenario = parseRunBundle(JSON.stringify({ ...good, scenario: {} }));
    expect(badScenario.ok).toBe(false);
    if (!badScenario.ok) expect(badScenario.error).toMatch(/scenario/i);
  });
});

describe("autoShare import (T-6.1)", () => {
  /** client → lb → app: the lb→app edge is a split edge, so it keeps autoShare. */
  function lbGraph(autoShare?: boolean): DesignGraph {
    return {
      nodes: [
        { id: "n-client", kind: "client", label: "Client", position: { x: 0, y: 0 }, config: {} },
        { id: "n-lb", kind: "lb", label: "LB", position: { x: 100, y: 0 }, config: {} },
        { id: "n-app", kind: "app_server", label: "App", position: { x: 200, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e-client-lb", source: "n-client", target: "n-lb", callsPerRequest: 1, kind: "sync" },
        {
          id: "e-lb-app",
          source: "n-lb",
          target: "n-app",
          trafficShare: 1,
          kind: "sync",
          ...(autoShare !== undefined ? { autoShare } : {}),
        },
      ],
      entryNodeId: "n-client",
    };
  }

  it("accepts edges with and without autoShare — no migration", () => {
    const withFlag = parseDesignRecord(
      JSON.stringify(buildDesignRecord("d1", "Design", lbGraph(false), "practice")),
    );
    expect(withFlag?.graph.edges[1].autoShare).toBe(false);

    const absent = parseDesignRecord(
      JSON.stringify(buildDesignRecord("d2", "Design", lbGraph(), "practice")),
    );
    expect(absent).not.toBeNull();
    expect(absent?.graph.edges[1].autoShare).toBeUndefined();
  });

  it("rejects a non-boolean autoShare", () => {
    const raw = JSON.parse(
      JSON.stringify(buildDesignRecord("d1", "Design", fixtureGraph(), "practice")),
    ) as { graph: { edges: Record<string, unknown>[] } };
    raw.graph.edges[0].autoShare = "yes";
    expect(parseDesignRecord(JSON.stringify(raw))).toBeNull();
  });
});

describe("edge migration (T-8.3)", () => {
  /** Pre-M8 shape: every edge carries trafficShare, whatever its source. */
  function legacyGraph(): Record<string, unknown> {
    return {
      nodes: [
        { id: "c", kind: "client", label: "Client", position: { x: 0, y: 0 }, config: {} },
        { id: "lb", kind: "lb", label: "LB", position: { x: 100, y: 0 }, config: {} },
        { id: "a", kind: "app_server", label: "App", position: { x: 200, y: 0 }, config: {} },
        { id: "cache", kind: "cache", label: "Cache", position: { x: 300, y: 0 }, config: {} },
        { id: "q", kind: "queue", label: "Queue", position: { x: 300, y: 100 }, config: {} },
      ],
      edges: [
        { id: "c-lb", source: "c", target: "lb", trafficShare: 1, kind: "sync" },
        { id: "lb-a", source: "lb", target: "a", trafficShare: 1, autoShare: false, kind: "sync" },
        { id: "a-cache", source: "a", target: "cache", trafficShare: 1, kind: "sync" },
        { id: "a-q", source: "a", target: "q", trafficShare: 0.2, autoShare: true, kind: "async" },
      ],
      entryNodeId: "c",
    };
  }

  const migratedEdges = [
    { id: "c-lb", source: "c", target: "lb", kind: "sync", callsPerRequest: 1 },
    { id: "lb-a", source: "lb", target: "a", kind: "sync", trafficShare: 1, autoShare: false },
    { id: "a-cache", source: "a", target: "cache", kind: "sync", callsPerRequest: 1 },
    { id: "a-q", source: "a", target: "q", kind: "async", callsPerRequest: 0.2 },
  ];

  function legacyRecordJson(id: string): string {
    return JSON.stringify({ id, name: "Legacy", mode: "practice", graph: legacyGraph() });
  }

  it("maps a non-lb trafficShare to callsPerRequest and drops foreign fields", () => {
    const record = parseDesignRecord(legacyRecordJson("d1"));
    expect(record).not.toBeNull();
    expect(record?.graph.edges).toStrictEqual(migratedEdges);
  });

  it("prefers callsPerRequest over a stray trafficShare; lb edges drop callsPerRequest", () => {
    const graph = legacyGraph();
    graph.edges = [
      { id: "c-lb", source: "c", target: "lb", trafficShare: 0.5, callsPerRequest: 2, kind: "sync" },
      { id: "lb-a", source: "lb", target: "a", trafficShare: 1, callsPerRequest: 3, kind: "sync" },
    ];
    const record = parseDesignRecord(
      JSON.stringify({ id: "d1", name: "Mixed", graph }),
    );
    expect(record?.graph.edges).toStrictEqual([
      { id: "c-lb", source: "c", target: "lb", kind: "sync", callsPerRequest: 2 },
      { id: "lb-a", source: "lb", target: "a", kind: "sync", trafficShare: 1 },
    ]);
  });

  it("rejects a non-finite callsPerRequest", () => {
    const graph = legacyGraph();
    graph.edges = [{ id: "c-lb", source: "c", target: "lb", callsPerRequest: "2", kind: "sync" }];
    expect(parseDesignRecord(JSON.stringify({ id: "d1", name: "Bad", graph }))).toBeNull();
  });

  it("timeoutMs/retries round-trip on call and lb edges (T-8.5)", () => {
    const graph = legacyGraph();
    graph.edges = [
      {
        id: "c-lb",
        source: "c",
        target: "lb",
        callsPerRequest: 1,
        timeoutMs: 200,
        retries: 3,
        kind: "sync",
      },
      {
        id: "lb-a",
        source: "lb",
        target: "a",
        trafficShare: 1,
        timeoutMs: 200,
        retries: 3,
        kind: "sync",
      },
    ];
    const record = parseDesignRecord(
      JSON.stringify({ id: "d1", name: "Resilient", graph }),
    );
    expect(record?.graph.edges).toStrictEqual([
      {
        id: "c-lb",
        source: "c",
        target: "lb",
        kind: "sync",
        callsPerRequest: 1,
        timeoutMs: 200,
        retries: 3,
      },
      {
        id: "lb-a",
        source: "lb",
        target: "a",
        kind: "sync",
        trafficShare: 1,
        timeoutMs: 200,
        retries: 3,
      },
    ]);
  });

  it("a breaker round-trips on a call edge and junk keys inside it are dropped (T-8.6)", () => {
    const graph = legacyGraph();
    graph.edges = [
      {
        id: "c-lb",
        source: "c",
        target: "lb",
        callsPerRequest: 1,
        breaker: { errorThreshold: 0.5, tripAfterSec: 0.5, cooldownSec: 5, extra: 1 },
        kind: "sync",
      },
    ];
    const record = parseDesignRecord(
      JSON.stringify({ id: "d1", name: "Guarded", graph }),
    );
    expect(record?.graph.edges).toStrictEqual([
      {
        id: "c-lb",
        source: "c",
        target: "lb",
        kind: "sync",
        callsPerRequest: 1,
        breaker: { errorThreshold: 0.5, tripAfterSec: 0.5, cooldownSec: 5 },
      },
    ]);
  });

  it("rejects a malformed breaker (T-8.6)", () => {
    const graph = legacyGraph();
    graph.edges = [
      {
        id: "c-lb",
        source: "c",
        target: "lb",
        breaker: { errorThreshold: "0.5", tripAfterSec: 0.5, cooldownSec: 5 },
        kind: "sync",
      },
    ];
    expect(
      parseDesignRecord(JSON.stringify({ id: "d1", name: "Bad", graph })),
    ).toBeNull();
  });

  it("rejects a non-numeric retries (T-8.5)", () => {
    const graph = legacyGraph();
    graph.edges = [
      { id: "c-lb", source: "c", target: "lb", retries: "3", kind: "sync" },
    ];
    expect(
      parseDesignRecord(JSON.stringify({ id: "d1", name: "Bad", graph })),
    ).toBeNull();
  });

  it("loadDesign migrates on read without rewriting the stored record", () => {
    localStorage.setItem(designStorageKey("legacy"), legacyRecordJson("legacy"));
    expect(loadDesign("legacy")?.graph.edges).toStrictEqual(migratedEdges);
    expect(localStorage.getItem(designStorageKey("legacy"))).toContain(
      '"trafficShare":0.2',
    );
  });

  it("parseRunBundle migrates both the design and the result snapshot; frames verbatim", () => {
    const bundle = buildRunBundle(
      buildDesignRecord("d1", "My design", fixtureGraph(), "practice"),
      fixtureScenario(),
      fixtureResult(),
    );
    const raw = JSON.parse(JSON.stringify(bundle)) as {
      design: { graph: unknown };
      result: { designSnapshot: unknown; frames: unknown };
    };
    raw.design.graph = legacyGraph();
    raw.result.designSnapshot = legacyGraph();
    const parsed = parseRunBundle(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.bundle.design.graph.edges).toStrictEqual(migratedEdges);
      expect(parsed.bundle.result.designSnapshot.edges).toStrictEqual(migratedEdges);
      expect(parsed.bundle.result.frames).toEqual(fixtureResult().frames);
    }
  });
});

describe("design mode (T-7.2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buildDesignRecord carries the given mode", () => {
    expect(buildDesignRecord("d1", "Q", fixtureGraph(), "quick").mode).toBe(
      "quick",
    );
  });

  it("every mode survives a parse round-trip", () => {
    for (const mode of ["quick", "practice", "interview"] as DesignMode[]) {
      const record = buildDesignRecord("d1", "Design", fixtureGraph(), mode);
      expect(parseDesignRecord(JSON.stringify(record))).toEqual(record);
    }
  });

  it("missing or invalid modes parse as practice", () => {
    expect(DEFAULT_DESIGN_MODE).toBe("practice");
    const record = buildDesignRecord("d1", "Design", fixtureGraph(), "quick");
    const legacy = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    delete legacy.mode;
    for (const raw of [legacy, { ...record, mode: "turbo" }, { ...record, mode: 42 }]) {
      expect(parseDesignRecord(JSON.stringify(raw))?.mode).toBe(
        DEFAULT_DESIGN_MODE,
      );
    }
  });

  it("loads a legacy stored record as practice without rewriting it", () => {
    const legacy = JSON.parse(
      JSON.stringify(buildDesignRecord("old", "Old", fixtureGraph(), "quick")),
    ) as Record<string, unknown>;
    delete legacy.mode;
    localStorage.setItem(designStorageKey("old"), JSON.stringify(legacy));

    expect(loadDesign("old")?.mode).toBe("practice");
    expect(listDesigns()[0].mode).toBe("practice");
    expect(localStorage.getItem(designStorageKey("old"))).not.toContain(
      '"mode"',
    );
  });

  it("listDesigns reports each record's own mode", () => {
    saveDesign({
      ...recordAt("dq", "Quick", "2026-06-01T00:00:00.000Z"),
      mode: "quick",
    });
    saveDesign(recordAt("dp", "Practice", "2026-01-01T00:00:00.000Z"));
    expect(listDesigns().map((d) => [d.id, d.mode])).toEqual([
      ["dq", "quick"],
      ["dp", "practice"],
    ]);
  });

  it("renameDesign keeps the mode", () => {
    saveDesign(buildDesignRecord("dq", "Quick", fixtureGraph(), "quick"));
    expect(renameDesign("dq", "Renamed")).not.toBeNull();
    expect(loadDesign("dq")?.mode).toBe("quick");
  });

  it("export round-trips the mode", async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((obj) => {
      blob = obj as Blob;
      return "blob:test";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });

    const record = buildDesignRecord("d1", "Quick one", fixtureGraph(), "quick");
    exportDesignFile(record);
    expect(blob).toBeDefined();
    const parsed = parseDesignRecord(await (blob as Blob).text());
    expect(parsed).toEqual(record);
    expect(parsed?.mode).toBe("quick");
  });

  it("the run bundle carries the mode; a mode-less bundle design is practice", () => {
    const bundle = buildRunBundle(
      buildDesignRecord("d1", "Q", fixtureGraph(), "quick"),
      fixtureScenario(),
      fixtureResult(),
    );
    const parsed = parseRunBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle.design.mode).toBe("quick");

    const raw = JSON.parse(JSON.stringify(bundle)) as {
      design: Record<string, unknown>;
    };
    delete raw.design.mode;
    const legacy = parseRunBundle(JSON.stringify(raw));
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.bundle.design.mode).toBe("practice");
  });
});
