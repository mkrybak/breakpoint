import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunResult, Scenario } from "../src/lib/core";
import {
  jsonStatus,
  statusTone,
  tokenizeJson,
} from "../src/components/boards/api/api-format";
import { HTTP_METHODS } from "../src/persistence/boards";
import {
  buildRunBundle,
  loadDesign,
  parseDesignRecord,
  parseRunBundle,
} from "../src/persistence/local";
import { useDesignStore } from "../src/stores/design-store";

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
    designSnapshot: { nodes: [], edges: [], entryNodeId: "" },
    frames: [
      { t: 0, perNode: {}, perEdge: {}, p95Ms: 10, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: [] },
      { t: 0.1, perNode: {}, perEdge: {}, p95Ms: 12, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: ["tick"] },
    ],
    verdict: { passed: true, failures: [], advisories: [] },
  };
}

const store = () => useDesignStore.getState();

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function expectLossless(input: string): void {
  const tokens = tokenizeJson(input);
  expect(tokens.map((t) => t.text).join("")).toBe(input);
  expect(tokens.every((t) => t.text.length > 0)).toBe(true);
}

describe("tokenizeJson", () => {
  it("is lossless on fixed edge cases", () => {
    for (const input of [
      "",
      "-",
      '"\\',
      '{"id": 12,\n  "items": [',
      '"unterminated\n{"a":1}',
      '\r\n\t  \\ " abc truex',
      "üñí ☕",
    ]) {
      expectLossless(input);
    }
  });

  it("is lossless on 2,000 random JSON-ish strings", () => {
    const alphabet = [...'{}[],:"\\ \n\t-0123456789.eEtruefalsnl abcü☕'];
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return seed;
    };
    for (let n = 0; n < 2000; n++) {
      const len = next() % 41;
      let s = "";
      for (let i = 0; i < len; i++) s += alphabet[next() % alphabet.length];
      expectLossless(s);
    }
  });

  it("classifies keys, strings, numbers and literals", () => {
    const tokens = tokenizeJson('{"a": "x", "b": -1.5e3, "c": true}');
    expect(tokens.filter((t) => t.kind === "key").map((t) => t.text)).toEqual(['"a"', '"b"', '"c"']);
    expect(tokens.filter((t) => t.kind === "string").map((t) => t.text)).toEqual(['"x"']);
    expect(tokens.filter((t) => t.kind === "number").map((t) => t.text)).toEqual(["-1.5e3"]);
    expect(tokens.filter((t) => t.kind === "literal").map((t) => t.text)).toEqual(["true"]);
  });

  it("stops an unterminated string at the line end", () => {
    const tokens = tokenizeJson('"ab\n{"k":1}');
    expect(tokens[0]).toEqual({ kind: "string", text: '"ab' });
    expect(tokens.find((t) => t.kind === "key")?.text).toBe('"k"');
  });
});

describe("jsonStatus", () => {
  it("treats blank as empty and lets JSON.parse decide the rest", () => {
    expect(jsonStatus("")).toBe("empty");
    expect(jsonStatus("  \n")).toBe("empty");
    expect(jsonStatus('{"a":1}')).toBe("valid");
    expect(jsonStatus("[]")).toBe("valid");
    expect(jsonStatus('{"a":')).toBe("invalid");
    expect(jsonStatus("[1,]")).toBe("invalid");
    expect(jsonStatus("{'a':1}")).toBe("invalid");
  });
});

describe("statusTone and methods", () => {
  it("tints by status class without validating", () => {
    expect(statusTone("201")).toContain("emerald");
    expect(statusTone(" 404 ")).toContain("amber");
    expect(statusTone("503")).toContain("rose");
    expect(statusTone("2xx")).toContain("neutral");
    expect(statusTone("")).toContain("neutral");
    expect(HTTP_METHODS).toEqual(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  });
});

const HALF_REQUEST = '{\n  "items": [\n    {"sku": "a1", "qty": 2},\n    {"sku": ';
const HALF_RESPONSE = '{ "note": "café ☕ \\u00e9 \\"q\\"",\r\n\t"total": 49.90,   ';

describe("review focus 4", () => {
  it("half-typed JSON round-trips byte-for-byte through store, record and bundle", () => {
    store().attachDesign("d-api-rt");
    const id = store().addEndpoint();

    for (let i = 1; i <= HALF_REQUEST.length; i++) {
      const prefix = HALF_REQUEST.slice(0, i);
      store().updateEndpoint(id, { requestBody: prefix });
      expect(store().boards.api.endpoints.find((e) => e.id === id)?.requestBody).toBe(prefix);
    }

    store().updateEndpoint(id, {
      method: "POST",
      url: "/v1/orders",
      status: "201",
      responseBody: HALF_RESPONSE,
    });
    vi.advanceTimersByTime(2000);

    const record = loadDesign("d-api-rt");
    if (!record) throw new Error("design was not autosaved");
    expect(record.boards.api.endpoints).toEqual([
      {
        id,
        method: "POST",
        url: "/v1/orders",
        status: "201",
        requestBody: HALF_REQUEST,
        responseBody: HALF_RESPONSE,
      },
    ]);
    expect(record.boards.api.endpoints[0].requestBody).toBe(HALF_REQUEST);
    expect(jsonStatus(record.boards.api.endpoints[0].requestBody)).toBe("invalid");
    expect(jsonStatus(record.boards.api.endpoints[0].responseBody)).toBe("invalid");

    // design-file path
    expect(parseDesignRecord(JSON.stringify(record, null, 2))?.boards.api).toEqual(record.boards.api);

    // bundle path
    const parsed = parseRunBundle(
      JSON.stringify(buildRunBundle(record, fixtureScenario(), fixtureResult()), null, 2),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.bundle.design.boards.api.endpoints).toEqual(record.boards.api.endpoints);

    // import path
    store().importRecord(parsed.bundle.design);
    expect(store().boards.api.endpoints[0].responseBody).toBe(HALF_RESPONSE);
  });
});
