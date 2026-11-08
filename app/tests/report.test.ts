import { describe, expect, it } from "vitest";
import type { ActionEvent, Scenario, Verdict } from "../src/lib/core";
import { emptyScorecard } from "../src/lib/grading";
import { buildReviewReport, relationPhrase } from "../src/persistence/report";
import { emptyBoards } from "../src/persistence/boards";
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
      boards: emptyBoards(),
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
      boards: emptyBoards(),
      actionLog: [],
      scorecard: emptyScorecard(),
    });
    expect(md).toContain("**Overall recommendation:** Hire");
    expect(md).not.toContain("## Simulation verdict");
    expect(md).toContain("_No actions recorded._");
    expect(md).toContain("## Requirements\n\n_Nothing written._");
    expect(md).toContain("## Entities\n\n_Nothing written._");
    expect(md).toContain("## API\n\n_Nothing written._");
  });

  it("renders the three step boards between scores and verdict", () => {
    const boards = emptyBoards();
    boards.requirements.functional = [
      { id: "f1", text: "Users place orders" },
      { id: "f2", text: "   " },
    ];
    boards.requirements.nonFunctional = [
      { id: "n1", text: "Target load: 5000 RPS", source: "scenario" },
    ];
    boards.entities.entities = [
      {
        id: "u",
        name: "User",
        fields: [
          { id: "u1", name: "id", type: "uuid" },
          { id: "u2", name: "email", type: "string" },
        ],
        position: { x: 0, y: 0 },
      },
      {
        id: "o",
        name: "Order",
        fields: [
          { id: "o1", name: "id", type: "uuid" },
          { id: "o2", name: "", type: "" },
        ],
        position: { x: 0, y: 0 },
      },
      { id: "p", name: "Product", fields: [], position: { x: 0, y: 0 } },
    ];
    boards.entities.relations = [
      { id: "r1", from: "u", to: "o", kind: "one-to-many" },
      { id: "r2", from: "o", to: "p", kind: "many-to-many" },
      { id: "r3", from: "p", to: "u", kind: "many-to-one" },
      { id: "r4", from: "u", to: "u", kind: "one-to-one" },
      { id: "r5", from: "u", to: "ghost", kind: "one-to-many" },
    ];
    boards.api.endpoints = [
      {
        id: "e1",
        method: "POST",
        url: "/v1/orders",
        status: "201",
        requestBody: '{"items": [1,',
        responseBody: "",
      },
      {
        id: "e2",
        method: "GET",
        url: "",
        status: "200",
        requestBody: "",
        responseBody: "```nested",
      },
    ];
    const verdict: Verdict = {
      passed: false,
      failures: [{ criterion: "p95", atSec: 42, detail: "1200ms > 300ms" }],
      advisories: ["add a cache"],
    };

    const md = buildReviewReport({
      designName: "Shop",
      scenario: { name: "Black Friday" } as Scenario,
      verdict,
      phaseNotes: emptyPhaseNotes(),
      boards,
      actionLog: [],
      scorecard: emptyScorecard(),
    });

    expect(md).toContain(
      "## Requirements\n\n**Functional**\n\n- Users place orders\n\n**Non-functional**\n\n- Target load: 5000 RPS _(scenario)_",
    );
    expect(md).toContain("**User**\n\n- id: uuid\n- email: string");
    expect(md).toContain("**Order**\n\n- id: uuid\n\n");
    expect(md).toContain("**Product**\n\n_No fields._");
    expect(md).toContain("- User 1 → many Order");
    expect(md).toContain("- Order many → many Product");
    expect(md).toContain("- Product many → 1 User");
    expect(md).toContain("- User 1 → 1 User");
    expect(md).toContain(
      '### POST /v1/orders → 201\n\n**Request**\n\n```json\n{"items": [1,\n```',
    );
    expect(md).toContain(
      "### GET (no URL) → 200\n\n**Response**\n\n````json\n```nested\n````",
    );
    expect(md).not.toContain("ghost");
    expect(md.indexOf("**Response**")).toBeGreaterThan(md.indexOf("### GET"));

    const scores = md.indexOf("## Scores");
    expect(scores).toBeLessThan(md.indexOf("## Requirements"));
    expect(scores).toBeLessThan(md.indexOf("## Entities"));
    expect(scores).toBeLessThan(md.indexOf("## API"));
    expect(scores).toBeLessThan(md.indexOf("## Simulation verdict"));
    expect(md.indexOf("## API")).toBeLessThan(
      md.indexOf("## Simulation verdict"),
    );
  });

  it("relationPhrase reads from → to", () => {
    expect(relationPhrase("User", "Order", "one-to-many")).toBe(
      "User 1 → many Order",
    );
  });
});
