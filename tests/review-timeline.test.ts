import { describe, expect, it } from "vitest";
import type { ActionEvent } from "../src/lib/core";
import {
  ACTION_KIND_LABEL,
  groupActionsByPhase,
} from "../src/components/review/timeline";

function ev(
  phase: ActionEvent["phase"],
  kind: ActionEvent["kind"],
  t: number,
): ActionEvent {
  return { t, phase, kind, detail: `${kind}@${t}` };
}

describe("groupActionsByPhase", () => {
  it("groups by phase in interview order, keeping global indices", () => {
    const log: ActionEvent[] = [
      ev("requirements", "note_edited", 10),
      ev("hld", "node_added", 700),
      ev("requirements", "phase_started", 0),
      ev("deepdive", "sim_run", 1900),
      ev("hld", "edge_added", 720),
    ];
    const groups = groupActionsByPhase(log);
    expect(groups.map((g) => g.phase)).toEqual([
      "requirements",
      "hld",
      "deepdive",
    ]);
    // requirements keeps its two events in log order, with original indices 0 and 2
    expect(groups[0].events.map((e) => e.index)).toEqual([0, 2]);
    expect(groups[1].events.map((e) => e.index)).toEqual([1, 4]);
    expect(groups[2].events.map((e) => e.index)).toEqual([3]);
  });

  it("returns no groups for an empty log", () => {
    expect(groupActionsByPhase([])).toEqual([]);
  });

  it("has a label for every action kind", () => {
    for (const kind of Object.values(ACTION_KIND_LABEL)) {
      expect(kind.length).toBeGreaterThan(0);
    }
  });
});
