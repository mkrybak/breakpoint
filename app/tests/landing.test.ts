import { describe, expect, it } from "vitest";
import { QUICK_DESIGN_NAME, starterGraph } from "@/components/quick/starter";
import {
  PRACTICE_DEFAULT_NAME,
  importAsNewDesign,
  newPracticeDesign,
  newQuickDesign,
  nextAvailableName,
} from "@/components/landing/new-design";
import {
  buildDesignRecord,
  emptyPhaseNotes,
  parseDesignRecord,
} from "@/persistence/local";

describe("landing new-design helpers (T-7.4)", () => {
  it("nextAvailableName numbers the base only when taken", () => {
    const base = "Quick simulation";
    expect(nextAvailableName(base, [])).toBe(base);
    expect(nextAvailableName(base, [base])).toBe("Quick simulation 2");
    expect(
      nextAvailableName(base, [base, "Quick simulation 2", "Other"]),
    ).toBe("Quick simulation 3");
    expect(nextAvailableName(base, ["Quick simulation 2"])).toBe(base);
  });

  it("newQuickDesign builds a quick record from the starter that survives the import guard", () => {
    const record = newQuickDesign("q1", []);
    expect(record.id).toBe("q1");
    expect(record.name).toBe(QUICK_DESIGN_NAME);
    expect(record.mode).toBe("quick");
    expect(record.scenarioId).toBe("");
    expect(record.actionLog).toEqual([]);
    expect(record.graph).toEqual(starterGraph());
    expect(parseDesignRecord(JSON.stringify(record))).toEqual(record);
  });

  it("newQuickDesign numbers the default name when it is taken", () => {
    expect(newQuickDesign("q2", [QUICK_DESIGN_NAME]).name).toBe(
      `${QUICK_DESIGN_NAME} 2`,
    );
  });

  it("newQuickDesign shares no objects between designs", () => {
    newQuickDesign("a", []).graph.nodes[0].label = "x";
    expect(newQuickDesign("b", []).graph.nodes[0].label).toBe("Client");
  });

  it("newPracticeDesign keeps today's create flow", () => {
    const record = newPracticeDesign("p1", "  URL shortener ");
    expect(record.name).toBe("URL shortener");
    expect(record.mode).toBe("practice");
    expect(record.graph).toEqual({ nodes: [], edges: [], entryNodeId: "" });
    expect(newPracticeDesign("p2", "   ").name).toBe(PRACTICE_DEFAULT_NAME);
  });

  it("importAsNewDesign keeps the file's mode and contents under a new id", () => {
    const file = buildDesignRecord(
      "file-id",
      "Shared",
      starterGraph(),
      "quick",
      { ...emptyPhaseNotes(), requirements: "1M users" },
      [{ t: 5, phase: "hld", kind: "node_added", detail: "App server" }],
    );
    const old = "2020-01-01T00:00:00.000Z";
    const parsed = parseDesignRecord(JSON.stringify({ ...file, updatedAt: old }));
    if (!parsed) throw new Error("fixture must parse");
    const imported = importAsNewDesign(parsed, "new-id");
    expect(imported.id).toBe("new-id");
    expect(imported.mode).toBe("quick");
    expect(imported.name).toBe(file.name);
    expect(imported.graph).toEqual(file.graph);
    expect(imported.phaseNotes).toEqual(file.phaseNotes);
    expect(imported.actionLog).toEqual(file.actionLog);
    expect(imported.updatedAt > old).toBe(true);
    expect(parsed.id).toBe("file-id");
  });

  it("a file without mode imports as practice", () => {
    const record = buildDesignRecord("f", "Old file", starterGraph(), "quick");
    const copy = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
    delete copy.mode;
    const parsed = parseDesignRecord(JSON.stringify(copy));
    if (!parsed) throw new Error("fixture must parse");
    expect(importAsNewDesign(parsed, "n").mode).toBe("practice");
  });
});
