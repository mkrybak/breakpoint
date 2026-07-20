import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyScorecard } from "../src/lib/grading";
import { saveScorecard, scorecardStorageKey } from "../src/persistence/scorecard";
import { useScorecardStore } from "../src/stores/scorecard-store";

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

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  useScorecardStore.setState({ scoredId: null, scorecard: emptyScorecard() });
});
afterEach(() => vi.unstubAllGlobals());

describe("scorecard-store", () => {
  it("attach loads a persisted scorecard", () => {
    const card = emptyScorecard();
    card.overall = "strong-hire";
    card.rubricScores.api.score = 5;
    saveScorecard("run-1", card);

    useScorecardStore.getState().attach("run-1");
    expect(useScorecardStore.getState().scoredId).toBe("run-1");
    expect(useScorecardStore.getState().scorecard).toEqual(card);
  });

  it("attach starts empty when nothing is stored", () => {
    useScorecardStore.getState().attach("fresh");
    expect(useScorecardStore.getState().scorecard).toEqual(emptyScorecard());
  });

  it("mutators update the working scorecard", () => {
    const s = useScorecardStore.getState();
    s.attach("run-2");
    s.setPhaseScore("hld", 4);
    s.setPhaseFeedback("hld", "good structure");
    s.setOverall("strong-hire");
    const card = useScorecardStore.getState().scorecard;
    expect(card.rubricScores.hld).toEqual({ score: 4, feedbackMd: "good structure" });
    expect(card.overall).toBe("strong-hire");
  });

  it("autosaves edits (debounced) but not the attach load", () => {
    vi.useFakeTimers();
    try {
      useScorecardStore.getState().attach("run-3");
      vi.advanceTimersByTime(600);
      // attach is not an edit → nothing written
      expect(localStorage.getItem(scorecardStorageKey("run-3"))).toBeNull();

      useScorecardStore.getState().setOverall("no-hire");
      vi.advanceTimersByTime(600);
      const stored = JSON.parse(
        localStorage.getItem(scorecardStorageKey("run-3")) ?? "{}",
      ) as { overall: string };
      expect(stored.overall).toBe("no-hire");
    } finally {
      vi.useRealTimers();
    }
  });
});
