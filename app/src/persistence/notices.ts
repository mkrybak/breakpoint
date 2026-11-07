import { listDesigns } from "./local";

/** Per-browser one-time HUD notes (T-12.5). */
export const P95_MODEL_NOTE_KEY = "bp:notes:p95-model";
/** T-8.7 (commit 56262f1) landed: designs saved before this saw p95 = 1.6 × mean. */
export const P95_MODEL_SINCE = "2026-11-07T07:19:55.000Z";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Pure: due iff not dismissed and some design was saved before the new model. */
export function isP95ModelNoteDue(
  dismissed: boolean,
  updatedAts: readonly string[],
): boolean {
  if (dismissed) return false;
  const since = Date.parse(P95_MODEL_SINCE);
  return updatedAts.some((at) => Date.parse(at) < since); // NaN compares false
}

/** Reads the dismissal and the saved designs; false without localStorage or on any error. */
export function p95ModelNoteDue(): boolean {
  try {
    const dismissed = storage()?.getItem(P95_MODEL_NOTE_KEY) === "dismissed";
    return isP95ModelNoteDue(
      dismissed,
      listDesigns().map((d) => d.updatedAt),
    );
  } catch {
    return false;
  }
}

/** Best-effort, like markChallengeSolved. */
export function dismissP95ModelNote(): void {
  try {
    storage()?.setItem(P95_MODEL_NOTE_KEY, "dismissed");
  } catch {
    // a note must never take the app down
  }
}
