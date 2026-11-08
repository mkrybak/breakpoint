import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignGraph, EntitiesBoard, EntityBox, RunResult, Scenario } from "../src/lib/core";
import {
  applySelection,
  dropIndex,
  endGlyphPath,
  entityRect,
  freeSpot,
  isDuplicatePair,
  reconnectOps,
  relationEnds,
  selfLoopPath,
  splitEdgeChanges,
  splitNodeChanges,
  toEntityFlow,
  toolbarHint,
} from "../src/components/boards/entities/entity-flow";
import { buildDesignRecord, buildRunBundle, parseRunBundle } from "../src/persistence/local";
import { useDesignStore } from "../src/stores/design-store";
import { usePhaseStore } from "../src/stores/phase-store";

function box(id: string, x = 0, y = 0): EntityBox {
  return { id, name: id, fields: [], position: { x, y } };
}

describe("relation glyphs", () => {
  it("reads cardinality from → to", () => {
    expect(relationEnds("one-to-one")).toEqual({ from: "one", to: "one" });
    expect(relationEnds("one-to-many")).toEqual({ from: "one", to: "many" });
    expect(relationEnds("many-to-one")).toEqual({ from: "many", to: "one" });
    expect(relationEnds("many-to-many")).toEqual({ from: "many", to: "many" });
  });

  it("draws a bar for one and a three-prong foot for many", () => {
    expect(endGlyphPath("one", 100, 50, 1)).toBe("M 110 44 L 110 56");
    expect(endGlyphPath("many", 100, 50, -1)).toBe(
      "M 86 50 L 100 44 M 86 50 L 100 50 M 86 50 L 100 56",
    );
  });

  it("loops a self-relation over the box top", () => {
    expect(selfLoopPath({ sx: 100, sy: 50, tx: 0, ty: 50, top: 0 })).toEqual([
      "M 100 50 H 120 V -24 H -20 V 50 H 0",
      50,
      -24,
    ]);
  });
});

describe("freeSpot", () => {
  const view = { x: 0, y: 0, width: 1000, height: 800 };

  it("takes the first cell of an empty view", () => {
    expect(freeSpot([], view)).toEqual({ position: { x: 24, y: 24 }, inView: true });
  });

  it("skips an occupied cell", () => {
    expect(freeSpot([{ x: 24, y: 24, width: 224, height: 150 }], view)).toEqual({
      position: { x: 280, y: 24 },
      inView: true,
    });
  });

  it("wraps to the next row when a row is full", () => {
    expect(
      freeSpot(
        [
          { x: 24, y: 24, width: 224, height: 150 },
          { x: 280, y: 24, width: 224, height: 150 },
        ],
        { x: 0, y: 0, width: 600, height: 800 },
      ),
    ).toEqual({ position: { x: 24, y: 328 }, inView: true });
  });

  it("goes right of every box when nothing is free", () => {
    expect(
      freeSpot([{ x: 24, y: 24, width: 224, height: 120 }], { x: 0, y: 0, width: 300, height: 200 }),
    ).toEqual({ position: { x: 280, y: 24 }, inView: false });
  });

  it("follows a panned view", () => {
    expect(freeSpot([], { x: -500, y: -100, width: 800, height: 600 })).toEqual({
      position: { x: -476, y: -76 },
      inView: true,
    });
  });
});

describe("flow mapping", () => {
  it("entityRect uses the measured size, else the 224×120 estimate", () => {
    const e = box("a", 10, 20);
    expect(entityRect(e, { a: { width: 230, height: 180 } })).toEqual({ x: 10, y: 20, width: 230, height: 180 });
    expect(entityRect(e, {})).toEqual({ x: 10, y: 20, width: 224, height: 120 });
  });

  it("toEntityFlow keeps board order and maps relations to typed edges", () => {
    const board: EntitiesBoard = {
      entities: [box("b", 5, 5), box("a")],
      relations: [{ id: "r1", from: "a", to: "b", kind: "many-to-one" }],
    };
    const { nodes, edges } = toEntityFlow(board, { b: { width: 224, height: 100 } }, new Set(["a", "r1"]));
    expect(nodes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(nodes[0]).toMatchObject({
      type: "entity",
      position: { x: 5, y: 5 },
      measured: { width: 224, height: 100 },
      selected: false,
    });
    expect(nodes[0].data.entity).toBe(board.entities[0]);
    expect(nodes[1].selected).toBe(true);
    expect(nodes[1].measured).toBeUndefined();
    expect(edges).toEqual([
      { id: "r1", type: "relation", source: "a", target: "b", selected: true, data: { kind: "many-to-one" } },
    ]);
  });

  it("isDuplicatePair matches either direction", () => {
    const rels = [{ id: "r", from: "a", to: "b", kind: "one-to-many" as const }];
    expect(isDuplicatePair(rels, "a", "b")).toBe(true);
    expect(isDuplicatePair(rels, "b", "a")).toBe(true);
    expect(isDuplicatePair(rels, "a", "c")).toBe(false);
    expect(isDuplicatePair(rels, "a", "a")).toBe(false);
    expect(isDuplicatePair([...rels, { id: "s", from: "a", to: "a", kind: "one-to-many" }], "a", "a")).toBe(true);
  });
});

describe("change splitting", () => {
  it("splitNodeChanges sorts dimensions, rounded moves, removes and selection", () => {
    const ops = splitNodeChanges([
      { type: "dimensions", id: "a", dimensions: { width: 224, height: 96 } },
      { type: "position", id: "a", position: { x: 10.6, y: 3.2 } },
      { type: "position", id: "b" },
      { type: "remove", id: "c" },
      { type: "select", id: "d", selected: true },
    ]);
    expect(ops).toEqual({
      dimensions: { a: { width: 224, height: 96 } },
      moves: [{ id: "a", position: { x: 11, y: 3 } }],
      removes: ["c"],
      selection: { d: true },
    });
  });

  it("splitEdgeChanges sorts removes and selection", () => {
    expect(
      splitEdgeChanges([
        { type: "remove", id: "r1" },
        { type: "select", id: "r2", selected: false },
      ]),
    ).toEqual({ removes: ["r1"], selection: { r2: false } });
  });

  it("applySelection returns prev when nothing changes", () => {
    const prev: ReadonlySet<string> = new Set(["a"]);
    expect(applySelection(prev, {})).toBe(prev);
    expect(applySelection(prev, { a: true, b: false })).toBe(prev);
    const next = applySelection(prev, { a: false, b: true });
    expect(next).not.toBe(prev);
    expect([...next]).toEqual(["b"]);
    expect([...prev]).toEqual(["a"]);
  });

  it("reconnectOps names the end that moved", () => {
    expect(reconnectOps({ source: "a", target: "b" }, { source: "a", target: "c" })).toEqual([
      { end: "to", entityId: "c" },
    ]);
    expect(reconnectOps({ source: "a", target: "b" }, { source: "c", target: "b" })).toEqual([
      { end: "from", entityId: "c" },
    ]);
    expect(reconnectOps({ source: "a", target: "b" }, { source: "a", target: "b" })).toEqual([]);
  });
});

describe("toolbar and reorder helpers", () => {
  it("toolbarHint has three branches", () => {
    expect(toolbarHint(0, 0)).toMatch(/^Add the core entities/);
    expect(toolbarHint(2, 0)).toBe(
      "Drag from a box's right dot onto another box (or itself) to relate them. Click a line to set its type.",
    );
    expect(toolbarHint(1, 0)).toBe(toolbarHint(2, 0)); // never mentions lines while there are none
    expect(toolbarHint(1, 1)).toMatch(/^Click a line/);
    expect(toolbarHint(3, 2)).toMatch(/^Click a line/);
  });

  it("dropIndex accounts for the dragged item's own slot", () => {
    expect(dropIndex(0, 2)).toBe(1);
    expect(dropIndex(2, 0)).toBe(0);
    expect(dropIndex(1, 1)).toBe(1);
  });
});

/* Review focus 3: deleting a box deletes its relations. */

function createStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

function fixtureGraph(): DesignGraph {
  return {
    nodes: [
      {
        id: "n-client",
        kind: "client",
        label: "Client",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "n-app",
        kind: "app_server",
        label: "App server",
        position: { x: 200, y: 0 },
        config: { replicas: 2 },
      },
    ],
    edges: [
      {
        id: "e-client-app",
        source: "n-client",
        target: "n-app",
        callsPerRequest: 1,
        kind: "sync",
      },
    ],
    entryNodeId: "n-client",
  };
}

function fixtureScenario(): Scenario {
  return {
    id: "s1",
    name: "Test scenario",
    description: "fixture",
    durationSec: 10,
    baseRps: 100,
    readRatio: 0.5,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01 },
    seed: 1,
  };
}

function fixtureResult(): RunResult {
  return {
    scenarioId: "s1",
    designSnapshot: fixtureGraph(),
    frames: [
      { t: 0, perNode: {}, perEdge: {}, p95Ms: 10, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: [] },
      { t: 0.1, perNode: {}, perEdge: {}, p95Ms: 12, errorRate: 0, servedRps: 100, asyncDroppedRps: 0, maxLagSec: 0, events: ["tick"] },
    ],
    verdict: { passed: true, failures: [], advisories: [] },
  };
}

describe("deleting a box (review focus 3)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
    usePhaseStore.setState({ phase: "entities", elapsedSec: 100, running: false, designId: "rec" });
    useDesignStore.getState().attachDesign("rec");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cascades to its relations, and the saved bundle stays valid", () => {
    const store = useDesignStore.getState();
    const user = store.addEntity({ x: 0, y: 0 }, "User");
    const order = store.addEntity({ x: 300, y: 0 }, "Order");
    const product = store.addEntity({ x: 600, y: 0 }, "Product");
    expect(store.addRelation(user, order)).not.toBeNull();
    const orderProduct = store.addRelation(order, product);
    expect(orderProduct).not.toBeNull();
    expect(store.addRelation(user, user)).not.toBeNull();

    // the board's path: React Flow's remove change → removeEntity
    splitNodeChanges([{ type: "remove", id: user }]).removes.forEach(store.removeEntity);

    expect(useDesignStore.getState().boards.entities.relations).toEqual([
      { id: orderProduct, from: order, to: product, kind: "one-to-many" },
    ]);

    const s = useDesignStore.getState();
    const record = buildDesignRecord("rec", "n", s.graph, "practice", undefined, [], s.boards);
    const parsed = parseRunBundle(JSON.stringify(buildRunBundle(record, fixtureScenario(), fixtureResult())));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const relations = parsed.bundle.design.boards.entities.relations;
      expect(relations).toHaveLength(1);
      expect(relations.some((r) => r.from === user || r.to === user)).toBe(false);
    }
  });
});
