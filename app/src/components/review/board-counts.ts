import type { DesignBoards } from "@/lib/core";

export type BoardKey = keyof DesignBoards; // "requirements" | "entities" | "api"
export type BoardCounts = Record<BoardKey, number>;

/** What a grader would see per board: non-blank requirements, entities, endpoints. */
export function boardCounts(boards: DesignBoards): BoardCounts {
  const { functional, nonFunctional } = boards.requirements;
  return {
    requirements: [...functional, ...nonFunctional].filter(
      (i) => i.text.trim() !== "",
    ).length,
    entities: boards.entities.entities.length,
    api: boards.api.endpoints.length,
  };
}

export function hasBoardContent(counts: BoardCounts): boolean {
  return counts.requirements + counts.entities + counts.api > 0;
}
