/** Per-browser Quick-mode progress (not per design). */
export const SOLVED_CHALLENGES_KEY = "bp:challenges:solved";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Forgiving guard: anything but a JSON array → []; keeps unique strings, in order. */
export function parseSolvedChallenges(text: string): string[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string"))];
}

export function loadSolvedChallenges(): string[] {
  try {
    const text = storage()?.getItem(SOLVED_CHALLENGES_KEY);
    return text == null ? [] : parseSolvedChallenges(text);
  } catch {
    return [];
  }
}

/** Idempotent. Returns the updated list even when the write fails (best-effort, like saveDesign). */
export function markChallengeSolved(scenarioId: string): string[] {
  const current = loadSolvedChallenges();
  const next = current.includes(scenarioId)
    ? current
    : [...current, scenarioId];
  try {
    storage()?.setItem(SOLVED_CHALLENGES_KEY, JSON.stringify(next));
  } catch {
    // progress must never take the app down
  }
  return next;
}
