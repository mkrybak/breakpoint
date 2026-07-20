import { describe, expect, it } from "vitest";
import type { DesignGraph, StressRule } from "../src/lib/core";
import {
  chaosAction,
  diffGraph,
  noteEditedAction,
  phaseStartedAction,
  simRunAction,
  stampAction,
} from "../src/lib/actions";

function graph(
  nodes: DesignGraph["nodes"],
  edges: DesignGraph["edges"] = [],
): DesignGraph {
  return { nodes, edges, entryNodeId: nodes[0]?.id ?? "" };
}

function node(
  id: string,
  label: string,
  config: DesignGraph["nodes"][number]["config"] = {},
) {
  return { id, kind: "app_server" as const, label, position: { x: 0, y: 0 }, config };
}

function edge(id: string, source: string, target: string) {
  return { id, source, target, trafficShare: 1, kind: "sync" as const };
}

describe("stampAction", () => {
  it("wraps a draft with t and phase", () => {
    expect(
      stampAction({ kind: "sim_run", detail: "ran X" }, 42, "hld"),
    ).toEqual({ t: 42, phase: "hld", kind: "sim_run", detail: "ran X" });
  });
});

describe("diffGraph", () => {
  it("records a node addition", () => {
    expect(diffGraph(graph([]), graph([node("a", "App server")]))).toEqual([
      { kind: "node_added", detail: "added App server" },
    ]);
  });

  it("records a node removal", () => {
    expect(diffGraph(graph([node("a", "App server")]), graph([]))).toEqual([
      { kind: "node_removed", detail: "removed App server" },
    ]);
  });

  it("records a rename and a config change on a surviving node", () => {
    const before = graph([node("a", "App server", { replicas: 1 })]);
    const after = graph([node("a", "API tier", { replicas: 3 })]);
    expect(diffGraph(before, after)).toEqual([
      { kind: "node_renamed", detail: "renamed App server → API tier" },
      { kind: "config_changed", detail: "set replicas: 3 on API tier" },
    ]);
  });

  it("records edge add and remove with resolved endpoint labels", () => {
    const nodes = [node("a", "App server"), node("b", "Cache")];
    const added = diffGraph(graph(nodes), graph(nodes, [edge("e", "a", "b")]));
    expect(added).toEqual([
      { kind: "edge_added", detail: "connected App server → Cache" },
    ]);
    const removed = diffGraph(graph(nodes, [edge("e", "a", "b")]), graph(nodes));
    expect(removed).toEqual([
      { kind: "edge_removed", detail: "disconnected App server → Cache" },
    ]);
  });

  it("ignores position-only changes", () => {
    const before = graph([node("a", "App server")]);
    const after = graph([
      { ...node("a", "App server"), position: { x: 100, y: 50 } },
    ]);
    expect(diffGraph(before, after)).toEqual([]);
  });
});

describe("emitters", () => {
  it("phaseStartedAction / noteEditedAction / simRunAction", () => {
    expect(phaseStartedAction("api")).toEqual({
      kind: "phase_started",
      detail: "entered api",
    });
    expect(noteEditedAction()).toEqual({
      kind: "note_edited",
      detail: "edited notes",
    });
    expect(simRunAction("Black Friday")).toEqual({
      kind: "sim_run",
      detail: "ran Black Friday",
    });
  });

  it("chaosAction formats each rule kind", () => {
    const kill: StressRule = { at: 0, rule: "kill", target: "app_server", count: 2 };
    const flush: StressRule = { at: 0, rule: "flush", target: "cache" };
    const spike: StressRule = { at: 0, rule: "spike", factor: 3, forSec: 5 };
    expect(chaosAction(kill)).toEqual({
      kind: "chaos_injected",
      detail: "killed 2 × app_server",
    });
    expect(chaosAction(flush).detail).toBe("flushed cache");
    expect(chaosAction(spike).detail).toBe("spike ×3");
  });
});
