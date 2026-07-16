import { create } from "zustand";
import type { Phase } from "@/lib/core";
import {
  emptyScorecard,
  type Recommendation,
  type RubricScore,
  type Scorecard,
} from "@/lib/grading";
import { loadScorecard, saveScorecard } from "@/persistence/scorecard";

interface ScorecardStore {
  /** The design/run id this scorecard grades, or null before attach. */
  scoredId: string | null;
  /** The working scorecard (autosaved to localStorage on edit). */
  scorecard: Scorecard;
  /** Load the scorecard for `id` from localStorage, or start an empty one. */
  attach: (id: string) => void;
  setPhaseScore: (phase: Phase, score: RubricScore) => void;
  setPhaseFeedback: (phase: Phase, feedbackMd: string) => void;
  setOverall: (overall: Recommendation) => void;
}

export const useScorecardStore = create<ScorecardStore>((set) => ({
  scoredId: null,
  scorecard: emptyScorecard(),

  attach: (id) =>
    set({ scoredId: id, scorecard: loadScorecard(id) ?? emptyScorecard() }),

  setPhaseScore: (phase, score) =>
    set((s) => ({
      scorecard: {
        ...s.scorecard,
        rubricScores: {
          ...s.scorecard.rubricScores,
          [phase]: { ...s.scorecard.rubricScores[phase], score },
        },
      },
    })),

  setPhaseFeedback: (phase, feedbackMd) =>
    set((s) => ({
      scorecard: {
        ...s.scorecard,
        rubricScores: {
          ...s.scorecard.rubricScores,
          [phase]: { ...s.scorecard.rubricScores[phase], feedbackMd },
        },
      },
    })),

  setOverall: (overall) =>
    set((s) => ({ scorecard: { ...s.scorecard, overall } })),
}));

// Debounced autosave (mirrors design-store). The scoredId guard skips the save on
// attach (the id changes there) — loading is not an edit. Only real mutations,
// which keep scoredId fixed and swap the scorecard reference, schedule a save.
const AUTOSAVE_DELAY_MS = 500;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

useScorecardStore.subscribe((state, prev) => {
  if (state.scoredId === null || state.scoredId !== prev.scoredId) return;
  if (state.scorecard === prev.scorecard) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    const s = useScorecardStore.getState();
    if (s.scoredId === null) return;
    saveScorecard(s.scoredId, s.scorecard);
  }, AUTOSAVE_DELAY_MS);
});
