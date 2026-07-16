import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignGraph } from "../src/lib/core";
import {
  buildDesignRecord,
  designStorageKey,
  loadDesign,
  parseDesignRecord,
  saveDesign,
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
        trafficShare: 1,
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
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
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
    const record = buildDesignRecord("d1", "My design", fixtureGraph(), {
      requirements: "reqs",
      entities: "",
      api: "",
      hld: "",
      deepdive: "",
    });
    expect(record.phaseNotes.requirements).toBe("reqs");
  });
});

describe("saveDesign / loadDesign", () => {
  it("round-trips a record through localStorage", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
    saveDesign(record);
    expect(localStorage.getItem(designStorageKey("d1"))).not.toBeNull();
    expect(loadDesign("d1")).toEqual(record);
  });

  it("returns null for an unknown id", () => {
    expect(loadDesign("nope")).toBeNull();
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.unstubAllGlobals();
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
    expect(() => saveDesign(record)).not.toThrow();
    expect(() => loadDesign("d1")).not.toThrow();
  });
});

describe("parseDesignRecord", () => {
  it("accepts its own export shape", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
    expect(parseDesignRecord(JSON.stringify(record))).toEqual(record);
  });

  it("rejects invalid JSON and non-record values", () => {
    expect(parseDesignRecord("not json{")).toBeNull();
    expect(parseDesignRecord('"just a string"')).toBeNull();
    expect(parseDesignRecord("[]")).toBeNull();
    expect(parseDesignRecord("{}")).toBeNull();
  });

  it("rejects a graph with an unknown node kind", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
    const raw = JSON.parse(JSON.stringify(record)) as {
      graph: { nodes: { kind: string }[] };
    };
    raw.graph.nodes[0].kind = "mainframe";
    expect(parseDesignRecord(JSON.stringify(raw))).toBeNull();
  });

  it("rejects a graph missing entryNodeId or with a bad edge kind", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
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
    expect(record?.actionLog).toEqual([]);
    expect(record?.phaseNotes.requirements).toBe("");
    expect(new Date(record?.updatedAt ?? "").getTime()).not.toBeNaN();
  });

  it("keeps valid phase notes and drops invalid actionLog entries", () => {
    const record = buildDesignRecord("d1", "My design", fixtureGraph());
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
