import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPhaseClock,
  parsePhaseClock,
  phaseClockStorageKey,
  savePhaseClock,
} from "../src/persistence/phase-clock";

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

const VALID = { phase: "hld", remainingSec: 842, elapsedSec: 758, running: false };

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phase clock persistence (T-12.7)", () => {
  it("round-trips a clock under bp:phase:<id>", () => {
    savePhaseClock("d1", { phase: "hld", remainingSec: 842, elapsedSec: 758, running: false });
    expect(phaseClockStorageKey("d1")).toBe("bp:phase:d1");
    expect(localStorage.getItem("bp:phase:d1")).not.toBeNull();
    expect(loadPhaseClock("d1")).toEqual(VALID);
  });

  it("returns null when nothing is saved", () => {
    expect(loadPhaseClock("missing")).toBeNull();
  });

  it("rejects invalid input as a whole", () => {
    const { running: _running, ...noRunning } = VALID;
    void _running;
    const cases = [
      "not json{",
      "[]",
      JSON.stringify({ ...VALID, phase: "design" }),
      JSON.stringify({ ...VALID, remainingSec: -1 }),
      JSON.stringify({ ...VALID, elapsedSec: "5" }),
      JSON.stringify(noRunning),
    ];
    for (const text of cases) {
      expect(parsePhaseClock(text)).toBeNull();
    }
  });

  it("drops extra fields", () => {
    const parsed = parsePhaseClock(JSON.stringify({ ...VALID, extra: 1, designId: "x" }));
    expect(parsed).toEqual(VALID);
    expect(Object.keys(parsed ?? {}).sort()).toEqual(
      ["elapsedSec", "phase", "remainingSec", "running"],
    );
  });

  it("no-ops without localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => savePhaseClock("d1", { phase: "hld", remainingSec: 1, elapsedSec: 1, running: true })).not.toThrow();
    expect(() => loadPhaseClock("d1")).not.toThrow();
    expect(loadPhaseClock("d1")).toBeNull();
  });
});
