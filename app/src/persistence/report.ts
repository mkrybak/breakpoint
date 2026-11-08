import type {
  ActionEvent,
  ApiBoard,
  DesignBoards,
  EntitiesBoard,
  Phase,
  RelationKind,
  RequirementsBoard,
  Scenario,
  Verdict,
} from "@/lib/core";
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
  boards: DesignBoards;
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

const NOTHING_WRITTEN = "_Nothing written._";

const RELATION_ENDS: Record<RelationKind, readonly [string, string]> = {
  "one-to-one": ["1", "1"],
  "one-to-many": ["1", "many"],
  "many-to-one": ["many", "1"],
  "many-to-many": ["many", "many"],
};

/** A relation in words, read from → to: "User 1 → many Order". */
export function relationPhrase(
  from: string,
  to: string,
  kind: RelationKind,
): string {
  const [fromEnd, toEnd] = RELATION_ENDS[kind];
  return `${from} ${fromEnd} → ${toEnd} ${to}`;
}

function orFallback(text: string, fallback: string): string {
  const t = text.trim();
  return t === "" ? fallback : t;
}

/** Fenced block whose fence is longer than any backtick run in the body (verbatim body). */
function fenced(body: string, lang: string): string[] {
  const longest = Math.max(
    0,
    ...(body.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [`${fence}${lang}`, body, fence];
}

function requirementsSection(board: RequirementsBoard): string[] {
  const columns = [
    ["Functional", board.functional],
    ["Non-functional", board.nonFunctional],
  ] as const;
  const filled = columns.map(
    ([title, items]) =>
      [title, items.filter((i) => i.text.trim() !== "")] as const,
  );
  const lines = ["## Requirements", ""];
  if (filled.every(([, items]) => items.length === 0))
    return [...lines, NOTHING_WRITTEN, ""];
  for (const [title, items] of filled) {
    lines.push(`**${title}**`, "");
    if (items.length === 0) lines.push("_None._");
    for (const item of items) {
      lines.push(
        `- ${item.text.trim()}${item.source === "scenario" ? " _(scenario)_" : ""}`,
      );
    }
    lines.push("");
  }
  return lines;
}

function entitiesSection(board: EntitiesBoard): string[] {
  const lines = ["## Entities", ""];
  if (board.entities.length === 0) return [...lines, NOTHING_WRITTEN, ""];
  const nameById = new Map(
    board.entities.map((e) => [e.id, orFallback(e.name, "(unnamed)")]),
  );
  for (const entity of board.entities) {
    lines.push(`**${orFallback(entity.name, "(unnamed)")}**`, "");
    const fields = entity.fields.filter(
      (f) => f.name.trim() !== "" || f.type.trim() !== "",
    );
    if (fields.length === 0) lines.push("_No fields._");
    for (const field of fields) {
      const type = field.type.trim();
      lines.push(
        `- ${orFallback(field.name, "(unnamed)")}${type === "" ? "" : `: ${type}`}`,
      );
    }
    lines.push("");
  }
  const phrases = board.relations.flatMap((r) => {
    const from = nameById.get(r.from);
    const to = nameById.get(r.to);
    return from !== undefined && to !== undefined
      ? [relationPhrase(from, to, r.kind)]
      : [];
  });
  if (phrases.length > 0) {
    lines.push("**Relationships**", "", ...phrases.map((p) => `- ${p}`), "");
  }
  return lines;
}

function apiSection(board: ApiBoard): string[] {
  const lines = ["## API", ""];
  if (board.endpoints.length === 0) return [...lines, NOTHING_WRITTEN, ""];
  for (const endpoint of board.endpoints) {
    const status = endpoint.status.trim();
    lines.push(
      `### ${endpoint.method} ${orFallback(endpoint.url, "(no URL)")}${status === "" ? "" : ` → ${status}`}`,
      "",
    );
    const bodies = [
      ["Request", endpoint.requestBody],
      ["Response", endpoint.responseBody],
    ] as const;
    for (const [title, body] of bodies) {
      if (body.trim() === "") continue;
      lines.push(`**${title}**`, "", ...fenced(body, "json"), "");
    }
  }
  return lines;
}

/** Render a full grader report as markdown (scores, anchors, notes, step boards, verdict, timeline). */
export function buildReviewReport(input: ReviewReportInput): string {
  const {
    designName,
    scenario,
    verdict,
    phaseNotes,
    boards,
    actionLog,
    scorecard,
  } = input;
  const lines: string[] = [];

  lines.push(`# Review — ${designName}`, "");
  lines.push(
    `**Overall recommendation:** ${recommendationLabel(scorecard.overall)}`,
    "",
  );
  if (scenario) {
    const outcome = verdict
      ? verdict.passed
        ? "passed"
        : "failed"
      : "not run";
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
  lines.push(
    ...requirementsSection(boards.requirements),
    ...entitiesSection(boards.entities),
    ...apiSection(boards.api),
  );

  if (verdict) {
    lines.push(
      "## Simulation verdict",
      "",
      verdict.passed ? "Passed." : "Failed.",
      "",
    );
    for (const failure of verdict.failures) {
      lines.push(
        `- ${failure.criterion} @ ${failure.atSec}s — ${failure.detail}`,
      );
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
