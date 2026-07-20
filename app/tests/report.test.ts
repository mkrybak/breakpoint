import { describe, expect, it } from "vitest";
import type { ActionEvent, Scenario, Verdict } from "../src/lib/core";
import { emptyScorecard } from "../src/lib/grading";
import { buildReviewReport } from "../src/persistence/report";
import { emptyPhaseNotes } from "../src/persistence/local";

describe("buildReviewReport", () => {
  it("renders recommendation, per-phase scores, feedback, verdict and timeline", () => {
    const scorecard = emptyScorecard();
    scorecard.overall = "strong-hire";
    scorecard.rubricScores.requirements = {
      score: 5,
      feedbackMd: "quantified the NFRs",
    };

    const verdict: Verdict = {
      passed: false,
      failures: [{ criterion: "p95", atSec: 42, detail: "1200ms > 300ms" }],
      advisories: ["add a cache"],
    };
    const scenario = { name: "Black Friday" } as Scenario;

    const phaseNotes = emptyPhaseNotes();
    phaseNotes.requirements = "3 functional reqs";

    const actionLog: ActionEvent[] = [
      { t: 65, phase: "hld", kind: "node_added", detail: "added Redis" },
    ];

    const md = buildReviewReport({
      designName: "Twitter",
      scenario,
      verdict,
      phaseNotes,
      actionLog,
      scorecard,
    });

    expect(md).toContain("# Review — Twitter");
    expect(md).toContain("**Overall recommendation:** Strong hire");
    expect(md).toContain("**Scenario:** Black Friday — failed");
    expect(md).toContain("### Requirements — 5/5");
    expect(md).toContain("quantified the NFRs");
    expect(md).toContain("3 functional reqs");
    expect(md).toContain("- p95 @ 42s — 1200ms > 300ms");
    expect(md).toContain("- advisory: add a cache");
    expect(md).toContain("- `01:05` (hld) added Redis");
  });

  it("handles no scenario, no verdict and an empty log", () => {
    const md = buildReviewReport({
      designName: "Empty",
      scenario: null,
      verdict: null,
      phaseNotes: emptyPhaseNotes(),
      actionLog: [],
      scorecard: emptyScorecard(),
    });
    expect(md).toContain("**Overall recommendation:** Hire");
    expect(md).not.toContain("## Simulation verdict");
    expect(md).toContain("_No actions recorded._");
  });
});
