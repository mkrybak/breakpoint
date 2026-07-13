import { describe, expect, it } from "vitest";
import type { DesignEdge, DesignGraph, DesignNode } from "../src/lib/core";
import { validateGraph } from "../src/lib/validation";

function node(id: string, kind: DesignNode["kind"] = "app_server"): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config: {} };
}

function edge(
  source: string,
  target: string,
  overrides: Partial<Pick<DesignEdge, "trafficShare" | "kind">> = {},
): DesignEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    trafficShare: overrides.trafficShare ?? 1,
    kind: overrides.kind ?? "sync",
  };
}

function graph(
  nodes: DesignNode[],
  edges: DesignEdge[],
  entryNodeId = "",
): DesignGraph {
  return { nodes, edges, entryNodeId };
}

describe("validateGraph", () => {
  it("returns no warnings for an empty graph", () => {
    expect(validateGraph(graph([], []))).toEqual([]);
  });

  it("returns no warnings for a valid chain", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("app")],
      [edge("c", "lb"), edge("lb", "app")],
      "c",
    );
    expect(validateGraph(g)).toEqual([]);
  });

  it("flags outbound shares that do not sum to 1", () => {
    const g = graph(
      [node("c", "client"), node("lb", "lb"), node("a"), node("b")],
      [
        edge("c", "lb"),
        edge("lb", "a", { trafficShare: 0.5 }),
        edge("lb", "b", { trafficShare: 0.7 }),
      ],
      "c",
    );
    const shares = validateGraph(g).filter((w) => w.code === "outbound-shares");
    expect(shares).toHaveLength(1);
    expect(shares[0].nodeIds).toEqual(["lb"]);
    expect(shares[0].edgeIds).toEqual(["e-lb-a", "e-lb-b"]);
    expect(shares[0].message).toContain("1.2");
  });

  it("accepts shares within epsilon of 1", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("b")],
      [
        edge("c", "a", { trafficShare: 0.35 }),
        edge("c", "b", { trafficShare: 0.65 }),
      ],
      "c",
    );
    expect(
      validateGraph(g).filter((w) => w.code === "outbound-shares"),
    ).toEqual([]);
  });

  it("flags orphan nodes", () => {
    const g = graph(
      [node("c", "client"), node("app"), node("lonely", "cache")],
      [edge("c", "app")],
      "c",
    );
    const orphans = validateGraph(g).filter((w) => w.code === "orphan-node");
    expect(orphans).toHaveLength(1);
    expect(orphans[0].nodeIds).toEqual(["lonely"]);
  });

  it("flags a missing entry client", () => {
    const g = graph([node("lb", "lb"), node("app")], [edge("lb", "app")], "");
    const entries = validateGraph(g).filter(
      (w) => w.code === "no-entry-client",
    );
    expect(entries).toHaveLength(1);
  });

  it("flags an entry that is not a client node", () => {
    const g = graph([node("lb", "lb"), node("app")], [edge("lb", "app")], "lb");
    expect(
      validateGraph(g).filter((w) => w.code === "no-entry-client"),
    ).toHaveLength(1);
  });

  it("flags cycles on sync paths with the member nodes and edges", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("b")],
      [edge("c", "a"), edge("a", "b"), edge("b", "a", { trafficShare: 1 })],
      "c",
    );
    const cycles = validateGraph(g).filter((w) => w.code === "sync-cycle");
    expect(cycles).toHaveLength(1);
    expect([...cycles[0].nodeIds].sort()).toEqual(["a", "b"]);
    expect([...cycles[0].edgeIds].sort()).toEqual(["e-a-b", "e-b-a"]);
    expect(cycles[0].message).toMatch(/^Sync cycle: /);
  });

  it("does not flag cycles broken by an async edge", () => {
    const g = graph(
      [node("c", "client"), node("a"), node("b")],
      [edge("c", "a"), edge("a", "b"), edge("b", "a", { kind: "async" })],
      "c",
    );
    expect(validateGraph(g).filter((w) => w.code === "sync-cycle")).toEqual([]);
  });

  it("flags a sync self-loop", () => {
    const g = graph(
      [node("c", "client"), node("a")],
      [edge("c", "a"), edge("a", "a")],
      "c",
    );
    const cycles = validateGraph(g).filter((w) => w.code === "sync-cycle");
    expect(cycles).toHaveLength(1);
    expect(cycles[0].nodeIds).toEqual(["a"]);
  });
});
