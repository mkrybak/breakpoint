import { describe, expect, it } from "vitest";
import {
  boardCounts,
  hasBoardContent,
} from "../src/components/review/board-counts";
import { emptyBoards } from "../src/persistence/boards";

describe("boardCounts", () => {
  it("counts nothing on empty boards", () => {
    const counts = boardCounts(emptyBoards());
    expect(counts).toEqual({ requirements: 0, entities: 0, api: 0 });
    expect(hasBoardContent(counts)).toBe(false);
  });

  it("counts non-blank requirements, entities and endpoints", () => {
    const boards = emptyBoards();
    boards.requirements.functional = [
      { id: "f1", text: "Users place orders" },
      { id: "f2", text: "  " },
    ];
    boards.requirements.nonFunctional = [
      { id: "n1", text: "p95 < 200ms", source: "scenario" },
    ];
    boards.entities.entities = [
      { id: "u", name: "User", fields: [], position: { x: 0, y: 0 } },
      { id: "o", name: "Order", fields: [], position: { x: 0, y: 0 } },
    ];
    boards.api.endpoints = [
      {
        id: "e1",
        method: "GET",
        url: "/v1/orders",
        status: "200",
        requestBody: "",
        responseBody: "",
      },
    ];
    const counts = boardCounts(boards);
    expect(counts).toEqual({ requirements: 2, entities: 2, api: 1 });
    expect(hasBoardContent(counts)).toBe(true);
  });

  it("treats a board with only a blank requirement as empty", () => {
    const boards = emptyBoards();
    boards.requirements.functional = [{ id: "f1", text: "   " }];
    expect(hasBoardContent(boardCounts(boards))).toBe(false);
  });
});
