import type { ActionEvent, Phase, Scenario, Verdict } from "@/lib/core";
import {
  RECOMMENDATION_OPTIONS,
  RUBRIC,
  type Recommendation,
  type Scorecard,
} from "@/lib/grading";

export interface ReviewReportInput {
  designName: string;
  scenario: Scenario | null;
  verdict: Verdict | null;
  phaseNotes: Record<Phase, string>;
  actionLog: ActionEvent[];
  scorecard: Scorecard;
}

/** Whole seconds → "mm:ss" (self-contained; keeps persistence free of store imports). */
function mmss(sec: number): string {
  const c = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

function recommendationLabel(value: Recommendation): string {
  return RECOMMENDATION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** Render a full grader report as markdown (scores, anchors, notes, verdict, timeline). */
export function buildReviewReport(input: ReviewReportInput): string {
  const { designName, scenario, verdict, phaseNotes, actionLog, scorecard } =
    input;
  const lines: string[] = [];

  lines.push(`# Review — ${designName}`, "");
  lines.push(
    `**Overall recommendation:** ${recommendationLabel(scorecard.overall)}`,
    "",
  );
  if (scenario) {
    const outcome = verdict ? (verdict.passed ? "passed" : "failed") : "not run";
    lines.push(`**Scenario:** ${scenario.name} — ${outcome}`, "");
  }

  lines.push("## Scores", "");
  for (const rubric of RUBRIC) {
    const phaseScore = scorecard.rubricScores[rubric.phase];
    const anchor =
      rubric.levels.find((l) => l.score === phaseScore.score)?.anchor ?? "";
    lines.push(`### ${rubric.title} — ${phaseScore.score}/5`, "", anchor, "");
    const note = phaseNotes[rubric.phase]?.trim();
    if (note) lines.push("**Candidate notes:**", "", note, "");
    const feedback = phaseScore.feedbackMd.trim();
    if (feedback) lines.push("**Feedback:**", "", feedback, "");
  }

  if (verdict) {
    lines.push("## Simulation verdict", "", verdict.passed ? "Passed." : "Failed.", "");
    for (const failure of verdict.failures) {
      lines.push(`- ${failure.criterion} @ ${failure.atSec}s — ${failure.detail}`);
    }
    for (const advisory of verdict.advisories) {
      lines.push(`- advisory: ${advisory}`);
    }
    if (verdict.failures.length > 0 || verdict.advisories.length > 0) {
      lines.push("");
    }
  }

  lines.push("## Action timeline", "");
  if (actionLog.length === 0) {
    lines.push("_No actions recorded._", "");
  } else {
    for (const event of actionLog) {
      lines.push(`- \`${mmss(event.t)}\` (${event.phase}) ${event.detail}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Triggers a browser download of the report as <slug>.review.md (mirrors exportDesignFile). */
export function exportReportFile(designName: string, markdown: string): void {
  const slug =
    designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "review";
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.review.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}
