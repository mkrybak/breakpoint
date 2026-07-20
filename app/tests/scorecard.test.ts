import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyScorecard, type Scorecard } from "../src/lib/grading";
import {
  loadScorecard,
  parseScorecard,
  saveScorecard,
  scorecardStorageKey,
} from "../src/persistence/scorecard";

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

beforeEach(() => vi.stubGlobal("localStorage", createStorageMock()));
afterEach(() => vi.unstubAllGlobals());

describe("parseScorecard", () => {
  it("round-trips a fully-specified scorecard", () => {
    const card: Scorecard = {
      runExportedAt: "2026-07-15T00:00:00.000Z",
      rubricScores: {
        requirements: { score: 5, feedbackMd: "great" },
        entities: { score: 4, feedbackMd: "" },
        api: { score: 3, feedbackMd: "" },
        hld: { score: 2, feedbackMd: "" },
        deepdive: { score: 1, feedbackMd: "weak" },
      },
      overall: "strong-hire",
    };
    expect(parseScorecard(JSON.stringify(card))).toEqual(card);
  });

  it("rejects non-JSON and non-objects", () => {
    expect(parseScorecard("not json")).toBeNull();
    expect(parseScorecard("[]")).toBeNull();
    expect(parseScorecard("42")).toBeNull();
  });

  it("fills defaults for missing / out-of-range fields", () => {
    // score 9 is out of range → default 3; every other field missing → empty defaults.
    expect(
      parseScorecard(JSON.stringify({ rubricScores: { api: { score: 9 } } })),
    ).toEqual(emptyScorecard());
  });

  it("keeps valid per-phase scores while defaulting the rest", () => {
    const parsed = parseScorecard(
      JSON.stringify({ rubricScores: { hld: { score: 5, feedbackMd: "solid" } } }),
    );
    expect(parsed?.rubricScores.hld).toEqual({ score: 5, feedbackMd: "solid" });
    expect(parsed?.rubricScores.api).toEqual({ score: 3, feedbackMd: "" });
    expect(parsed?.overall).toBe("hire");
  });
});

describe("saveScorecard / loadScorecard", () => {
  it("persists and reloads under the id key", () => {
    const card = emptyScorecard();
    card.overall = "no-hire";
    saveScorecard("run-1", card);
    expect(localStorage.getItem(scorecardStorageKey("run-1"))).not.toBeNull();
    expect(loadScorecard("run-1")).toEqual(card);
  });

  it("returns null when nothing is stored", () => {
    expect(loadScorecard("missing")).toBeNull();
  });
});
