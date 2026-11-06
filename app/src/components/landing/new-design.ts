import { QUICK_DESIGN_NAME, starterGraph } from "@/components/quick/starter";
import { buildDesignRecord, type DesignRecord } from "@/persistence/local";

/** Today's create-flow default, kept for Practice. */
export const PRACTICE_DEFAULT_NAME = "Untitled design";

/** `base`, else `base 2`, `base 3`, … — the first one not in `taken`. */
export function nextAvailableName(base: string, taken: readonly string[]): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Quick card: the starter graph under the default name (numbered if taken). */
export function newQuickDesign(id: string, takenNames: readonly string[]): DesignRecord {
  return buildDesignRecord(
    id,
    nextAvailableName(QUICK_DESIGN_NAME, takenNames),
    starterGraph(),
    "quick",
  );
}

/** Practice card: today's create flow — blank canvas, trimmed name or the default. */
export function newPracticeDesign(id: string, name: string): DesignRecord {
  return buildDesignRecord(
    id,
    name.trim() || PRACTICE_DEFAULT_NAME,
    { nodes: [], edges: [], entryNodeId: "" },
    "practice",
  );
}

/**
 * Landing-page import: always a new design (fresh id, updatedAt = now) that
 * keeps the parsed file's mode — parseDesignRecord already maps a missing
 * mode to "practice". Importing never converts a mode.
 */
export function importAsNewDesign(parsed: DesignRecord, id: string): DesignRecord {
  return { ...parsed, id, updatedAt: new Date().toISOString() };
}
