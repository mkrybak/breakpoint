import type { Phase } from "@/lib/core";
import { emptyScorecard, type Recommendation, type RubricScore, type Scorecard } from "@/lib/grading";

const KEY_PREFIX = "bp:scorecard:";
const PHASES: Phase[] = ["requirements", "entities", "api", "hld", "deepdive"];
const SCORES: RubricScore[] = [1, 2, 3, 4, 5];
const RECOMMENDATIONS: Recommendation[] = ["strong-hire", "hire", "no-hire"];

export function scorecardStorageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Best-effort: no-ops without localStorage (SSR, node tests) or on quota errors. */
export function saveScorecard(id: string, scorecard: Scorecard): void {
  try {
    storage()?.setItem(scorecardStorageKey(id), JSON.stringify(scorecard));
  } catch {
    // autosave must never take the app down
  }
}

export function loadScorecard(id: string): Scorecard | null {
  try {
    const text = storage()?.getItem(scorecardStorageKey(id));
    return text == null ? null : parseScorecard(text);
  } catch {
    return null;
  }
}

/**
 * Hand-rolled import guard (02-data-model style, mirroring parseDesignRecord):
 * rejects only non-JSON / non-object input; fills defaults for every missing or
 * out-of-range field, so a forward-compatible RunBundle still loads. M5's import
 * reuses this.
 */
export function parseScorecard(text: string): Scorecard | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const base = emptyScorecard();
  const raw = isRecord(value.rubricScores) ? value.rubricScores : {};
  for (const phase of PHASES) {
    const entry = raw[phase];
    if (!isRecord(entry)) continue;
    if (SCORES.includes(entry.score as RubricScore)) {
      base.rubricScores[phase].score = entry.score as RubricScore;
    }
    if (typeof entry.feedbackMd === "string") {
      base.rubricScores[phase].feedbackMd = entry.feedbackMd;
    }
  }

  return {
    runExportedAt:
      typeof value.runExportedAt === "string" ? value.runExportedAt : "",
    rubricScores: base.rubricScores,
    overall: RECOMMENDATIONS.includes(value.overall as Recommendation)
      ? (value.overall as Recommendation)
      : base.overall,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
