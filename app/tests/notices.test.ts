import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDesignRecord, saveDesign } from "../src/persistence/local";
import {
  dismissP95ModelNote,
  isP95ModelNoteDue,
  P95_MODEL_NOTE_KEY,
  p95ModelNoteDue,
} from "../src/persistence/notices";

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

const OLD = "2026-11-01T00:00:00.000Z";

describe("isP95ModelNoteDue (T-12.5)", () => {
  it("is due only for an undismissed design saved before the new model", () => {
    expect(isP95ModelNoteDue(false, [OLD])).toBe(true);
    expect(isP95ModelNoteDue(false, ["2026-11-08T00:00:00.000Z"])).toBe(false);
    expect(isP95ModelNoteDue(true, [OLD])).toBe(false);
    expect(isP95ModelNoteDue(false, ["garbage"])).toBe(false);
    expect(isP95ModelNoteDue(false, [])).toBe(false);
  });
});

describe("p95 model note storage (T-12.5)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not due with nothing saved", () => {
    expect(p95ModelNoteDue()).toBe(false);
  });

  it("is due for an old saved design until dismissed", () => {
    saveDesign({
      ...buildDesignRecord(
        "d1",
        "Old design",
        { nodes: [], edges: [], entryNodeId: "" },
        "quick",
      ),
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    expect(p95ModelNoteDue()).toBe(true);
    dismissP95ModelNote();
    expect(p95ModelNoteDue()).toBe(false);
    expect(localStorage.getItem(P95_MODEL_NOTE_KEY)).toBe("dismissed");
  });

  it("is never due and never throws without localStorage", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", undefined);
    expect(p95ModelNoteDue()).toBe(false);
    expect(() => dismissP95ModelNote()).not.toThrow();
  });
});
