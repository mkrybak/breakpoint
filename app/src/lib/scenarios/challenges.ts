/**
 * A Quick-mode challenge: one Quick scenario plus copy. Plain data; the
 * scenario id is the challenge's identity (and its solved-state key).
 */
export interface QuickChallenge {
  scenarioId: string;
  /** one line, shown in the nudge and the list */
  goal: string;
  /** shown after a failed attempt */
  hint?: string;
}

/**
 * Ordered: the nudge suggests the first unsolved one. To add a challenge:
 * a presets/*.json scenario, its QUICK_SCENARIOS entry, and one entry here.
 */
export const QUICK_CHALLENGES: readonly QuickChallenge[] = [
  {
    scenarioId: "quick-spike-3x",
    goal: "Survive a 3× traffic spike",
    hint: "One app server tops out around 4,000 RPS. Select it and add a replica.",
  },
  {
    scenarioId: "quick-lose-app-server",
    goal: "Lose an app server without errors",
    hint: "Run one more replica than the load needs, so the rest can cover for a crashed one.",
  },
  {
    scenarioId: "quick-black-friday",
    goal: "Hold up through a Black Friday rush",
    hint: "Traffic peaks around 12,000 RPS during the flash sale. Size the app tier for the peak, not the morning.",
  },
  {
    scenarioId: "quick-celebrity-tweet",
    goal: "Ride out a celebrity tweet",
    hint: "Almost all of this traffic reads the same post. Put a CDN in front of the app server, or scale out.",
  },
];

export function getQuickChallenge(
  scenarioId: string,
): QuickChallenge | undefined {
  return QUICK_CHALLENGES.find((c) => c.scenarioId === scenarioId);
}
