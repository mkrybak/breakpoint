import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignBoards, DesignGraph, RunResult, Scenario } from "../src/lib/core";
import { emptyBoards, parseDesignBoards } from "../src/persistence/boards";
import {
  buildDesignRecord,
  buildRunBundle,
  loadDesign,
  parseDesignRecord,
  parseRunBundle,
  saveDesign,
  type DesignRecord,
} from "../src/persistence/local";

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
      { id: "n-client", kind: "client", label: "Client", position: { x: 0, y: 0 }, config: {} },
      {
        id: "n-app",
        kind: "app_server",
        label: "App server",
        position: { x: 200, y: 0 },
        config: { replicas: 2 },
      },
    ],
    edges: [
      { id: "e-client-app", source: "n-client", target: "n-app", kind: "sync", callsPerRequest: 1 },
    ],
    entryNodeId: "n-client",
  };
}

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
    ],
    verdict: { passed: true, failures: [], advisories: [] },
  };
}

/** All three boards, literals in the canonical key order. */
function fullBoards(): DesignBoards {
  return {
    requirements: {
      functional: [
        { id: "f1", text: "Users can place orders" },
        { id: "f2", text: "Users can list their orders" },
      ],
      nonFunctional: [{ id: "nf1", text: "p95 < 200 ms", source: "scenario" }],
      nonFunctionalSeeded: true,
    },
    entities: {
      entities: [
        {
          id: "user",
          name: "User",
          fields: [
            { id: "u1", name: "id", type: "uuid" },
            { id: "u2", name: "email", type: "string" },
          ],
          position: { x: 0, y: 0 },
        },
        {
          id: "order",
          name: "Order",
          fields: [{ id: "o1", name: "id", type: "uuid" }],
          position: { x: 240, y: 40 },
        },
        {
          id: "product",
          name: "Product",
          fields: [{ id: "p1", name: "sku", type: "string" }],
          position: { x: 480, y: -20.5 },
        },
      ],
      relations: [
        { id: "r1", from: "user", to: "order", kind: "one-to-many" },
        { id: "r2", from: "order", to: "product", kind: "many-to-many" },
      ],
    },
    api: {
      endpoints: [
        {
          id: "ep1",
          method: "POST",
          url: "/v1/orders",
          status: "201",
          requestBody: '{"items": [1,',
          responseBody: '{\n  "id": "o-1"\n}',
        },
        {
          id: "ep2",
          method: "GET",
          url: "/v1/orders/:id",
          status: "200",
          requestBody: "",
          responseBody: "{}",
        },
      ],
    },
  };
}

function recordWith(boards: DesignBoards): DesignRecord {
  return buildDesignRecord("d1", "Shop", fixtureGraph(), "practice", undefined, [], boards);
}

/** Parse a record JSON whose `boards` is replaced by an arbitrary value. */
function parseWithBoards(boards: unknown): DesignRecord {
  const base = {
    id: "d1",
    name: "Shop",
    graph: fixtureGraph(),
    phaseNotes: { requirements: "keep me", entities: "", api: "", hld: "", deepdive: "" },
    boards,
  };
  const parsed = parseDesignRecord(JSON.stringify(base));
  expect(parsed).not.toBeNull();
  return parsed!;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DesignRecord.boards", () => {
  it("round-trips a record with all three boards", () => {
    const record = recordWith(fullBoards());
    const parsed = parseDesignRecord(JSON.stringify(record));
    expect(parsed).toEqual(record);
    expect(JSON.stringify(parsed!.boards)).toBe(JSON.stringify(record.boards));

    saveDesign(record);
    expect(loadDesign("d1")?.boards).toEqual(fullBoards());
  });

  it("loads an old record without boards as empty boards, notes unchanged", () => {
    const old = {
      id: "old",
      name: "Old",
      graph: fixtureGraph(),
      phaseNotes: { requirements: "old note", entities: "", api: "", hld: "", deepdive: "" },
    };
    const parsed = parseDesignRecord(JSON.stringify(old));
    expect(parsed?.boards).toEqual(emptyBoards());
    expect(parsed?.phaseNotes.requirements).toBe("old note");
  });

  it("loads malformed whole fields as empty boards", () => {
    for (const bad of ["nope", [], null, { requirements: 5, entities: null, api: { endpoints: "x" } }]) {
      const parsed = parseWithBoards(bad);
      expect(parsed.boards).toEqual(emptyBoards());
      expect(parsed.phaseNotes.requirements).toBe("keep me");
    }
  });

  it("drops malformed items and keeps the rest", () => {
    const parsed = parseWithBoards({
      requirements: {
        functional: [
          { id: "f1", text: "ok" },
          { id: "f2", text: 42 },
          { id: "f3", text: "typed", source: "user" },
          { id: "f4", text: "extra", note: "dropped" },
        ],
        nonFunctional: [
          { id: "f1", text: "duplicate id across lists" },
          { id: "nf1", text: "seeded", source: "scenario" },
        ],
        nonFunctionalSeeded: "yes",
      },
      entities: {
        entities: [
          { id: "a", name: "A", fields: [], position: { x: 0, y: 0 } },
          { id: "nopos", name: "No position", fields: [] },
          { id: "b", name: "B", fields: "x", position: { x: 1, y: 2 } },
          {
            id: "c",
            name: "C",
            fields: [
              { id: "c1", name: "id", type: "uuid", color: "red" },
              { id: "c2", name: "missing type" },
            ],
            position: { x: 3, y: 4, z: 5 },
          },
        ],
        relations: [
          { id: "r1", from: "a", to: "b", kind: "one-to-one" },
          { id: "r2", from: "a", to: "c", kind: "some" },
        ],
      },
      api: {
        endpoints: [
          { id: "e1", method: "GET", url: "/x", status: "200", requestBody: "", responseBody: "" },
          { id: "e2", method: "TRACE", url: "/x", status: "200", requestBody: "", responseBody: "" },
          { id: "e3", method: "POST", url: "/x", status: 201, requestBody: "", responseBody: "" },
        ],
      },
    });
    expect(parsed.boards).toEqual({
      requirements: {
        functional: [
          { id: "f1", text: "ok" },
          { id: "f3", text: "typed" },
          { id: "f4", text: "extra" },
        ],
        nonFunctional: [{ id: "nf1", text: "seeded", source: "scenario" }],
        nonFunctionalSeeded: false,
      },
      entities: {
        entities: [
          { id: "a", name: "A", fields: [], position: { x: 0, y: 0 } },
          { id: "b", name: "B", fields: [], position: { x: 1, y: 2 } },
          { id: "c", name: "C", fields: [{ id: "c1", name: "id", type: "uuid" }], position: { x: 3, y: 4 } },
        ],
        relations: [{ id: "r1", from: "a", to: "b", kind: "one-to-one" }],
      },
      api: {
        endpoints: [{ id: "e1", method: "GET", url: "/x", status: "200", requestBody: "", responseBody: "" }],
      },
    });
    // toEqual ignores key presence for undefined; check the dropped keys are really gone.
    expect("source" in parsed.boards.requirements.functional[1]).toBe(false);
    expect("note" in parsed.boards.requirements.functional[2]).toBe(false);
  });

  it("drops dangling relations, keeps a valid self-relation", () => {
    const boards = parseDesignBoards({
      entities: {
        entities: [
          { id: "a", name: "A", fields: [], position: { x: 0, y: 0 } },
          { id: "b", name: "B", fields: [], position: { x: 10, y: 0 } },
          { id: "broken", name: "Broken", fields: [], position: { x: "0", y: 0 } },
        ],
        relations: [
          { id: "ok", from: "a", to: "b", kind: "one-to-many" },
          { id: "ghost", from: "a", to: "nobody", kind: "one-to-many" },
          { id: "frombroken", from: "broken", to: "b", kind: "many-to-one" },
          { id: "self", from: "a", to: "a", kind: "one-to-one" },
        ],
      },
    });
    expect(boards.entities.entities.map((e) => e.id)).toEqual(["a", "b"]);
    expect(boards.entities.relations.map((r) => r.id)).toEqual(["ok", "self"]);
  });
});

describe("RunBundle with boards (review focus 5)", () => {
  it("export → parse is byte-identical, version 1", () => {
    const record = recordWith(fullBoards());
    const text = JSON.stringify(buildRunBundle(record, fixtureScenario(), fixtureResult()), null, 2);
    const parsed = parseRunBundle(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.version).toBe(1);
    expect(JSON.stringify(parsed.bundle, null, 2)).toBe(text);
    expect(parsed.bundle.design.boards.api.endpoints[0].requestBody).toBe('{"items": [1,');
  });

  it("a bundle whose design lacks boards loads with empty boards", () => {
    const bundle = buildRunBundle(recordWith(fullBoards()), fixtureScenario(), fixtureResult());
    const { boards: _dropped, ...design } = bundle.design;
    void _dropped;
    const parsed = parseRunBundle(JSON.stringify({ ...bundle, design }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.bundle.design.boards).toEqual(emptyBoards());
  });
});
