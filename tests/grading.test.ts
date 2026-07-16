import { describe, expect, it } from "vitest";
import type { Phase } from "../src/lib/core";
import {
  emptyScorecard,
  phaseRubric,
  RECOMMENDATION_OPTIONS,
  RUBRIC,
} from "../src/lib/grading";

const PHASES: Phase[] = ["requirements", "entities", "api", "hld", "deepdive"];

describe("RUBRIC", () => {
  it("covers every phase exactly once, in order", () => {
    expect(RUBRIC.map((r) => r.phase)).toEqual(PHASES);
  });

  it("gives each phase five non-empty anchors, one per score 1–5", () => {
    for (const rubric of RUBRIC) {
      expect(rubric.levels.map((l) => l.score).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(rubric.levels.every((l) => l.anchor.trim().length > 0)).toBe(true);
      expect(rubric.title.length).toBeGreaterThan(0);
      expect(rubric.focus.length).toBeGreaterThan(0);
    }
  });
});

describe("phaseRubric", () => {
  it("returns the rubric for a phase", () => {
    expect(phaseRubric("api").title).toBe("API");
  });
});

describe("RECOMMENDATION_OPTIONS", () => {
  it("lists the three recommendations strong → weak", () => {
    expect(RECOMMENDATION_OPTIONS.map((o) => o.value)).toEqual([
      "strong-hire",
      "hire",
      "no-hire",
    ]);
  });
});

describe("emptyScorecard", () => {
  it("is neutral: score 3 per phase, hire overall, no timestamp", () => {
    const card = emptyScorecard();
    expect(card.runExportedAt).toBe("");
    expect(card.overall).toBe("hire");
    for (const phase of PHASES) {
      expect(card.rubricScores[phase]).toEqual({ score: 3, feedbackMd: "" });
    }
  });

  it("returns an independent object graph each call", () => {
    const a = emptyScorecard();
    a.rubricScores.api.score = 5;
    expect(emptyScorecard().rubricScores.api.score).toBe(3);
  });
});
