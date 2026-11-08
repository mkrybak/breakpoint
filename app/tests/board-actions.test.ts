import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionEvent, DesignBoards } from "../src/lib/core";
import { emptyBoards } from "../src/persistence/boards";
import {
  buildDesignRecord,
  designStorageKey,
  parseDesignRecord,
} from "../src/persistence/local";
import { emptyGraph, useDesignStore } from "../src/stores/design-store";
import { usePhaseStore } from "../src/stores/phase-store";

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

const store = () => useDesignStore.getState();
const boards = () => store().boards;

function log(): Pick<ActionEvent, "phase" | "kind" | "detail">[] {
  return store().actionLog.map((e) => ({ phase: e.phase, kind: e.kind, detail: e.detail }));
}

function withFakeTimers(body: () => void): void {
  vi.useFakeTimers();
  try {
    body();
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  usePhaseStore.setState({ phase: "hld", elapsedSec: 100, running: false, designId: "rec" });
  store().attachDesign("rec");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requirements actions", () => {
  it("append, insert-after, update, remove", () => {
    const a = store().addRequirement("functional", null, "A");
    const c = store().addRequirement("functional", undefined, "C");
    const b = store().addRequirement("functional", a, "B");
    const blank = store().addRequirement("functional", "unknown");
    expect(boards().requirements.functional.map((r) => r.text)).toEqual(["A", "B", "C", ""]);

    store().updateRequirement("functional", b, "B2");
    store().removeRequirement("functional", blank);
    expect(boards().requirements.functional).toEqual([
      { id: a, text: "A" },
      { id: b, text: "B2" },
      { id: c, text: "C" },
    ]);
    expect(boards().requirements.nonFunctional).toEqual([]);
  });

  it("moveRequirement clamps out-of-range indexes", () => {
    const [a, b, c] = ["A", "B", "C"].map((t) => store().addRequirement("functional", null, t));
    store().moveRequirement("functional", a, 99);
    expect(boards().requirements.functional.map((r) => r.id)).toEqual([b, c, a]);
    store().moveRequirement("functional", a, -5);
    expect(boards().requirements.functional.map((r) => r.id)).toEqual([a, b, c]);
    store().moveRequirement("functional", c, 1.7);
    expect(boards().requirements.functional.map((r) => r.id)).toEqual([a, c, b]);
  });

  it("unknown ids and no-change calls leave boards untouched", () => {
    const a = store().addRequirement("functional", null, "A");
    const before = boards();
    store().updateRequirement("functional", "nope", "x");
    store().updateRequirement("functional", a, "A");
    store().updateRequirement("nonFunctional", a, "wrong list");
    store().removeRequirement("functional", "nope");
    store().moveRequirement("functional", "nope", 0);
    store().moveRequirement("functional", a, 0);
    expect(boards()).toBe(before);
  });
});

describe("seedNonFunctional (once per design)", () => {
  it("adds scenario items and sets the flag; a second call is a no-op", () => {
    expect(store().seedNonFunctional(["p95 < 200 ms", "99.9% uptime"])).toBe(true);
    const nf = boards().requirements.nonFunctional;
    expect(nf.map((r) => [r.text, r.source])).toEqual([
      ["p95 < 200 ms", "scenario"],
      ["99.9% uptime", "scenario"],
    ]);
    expect(boards().requirements.nonFunctionalSeeded).toBe(true);
    expect(store().seedNonFunctional(["again"])).toBe(false);
    expect(boards().requirements.nonFunctional).toBe(nf);
  });

  it("does not re-seed after every NFR item was removed", () => {
    store().seedNonFunctional(["one"]);
    const [item] = boards().requirements.nonFunctional;
    store().removeRequirement("nonFunctional", item.id);
    expect(store().seedNonFunctional(["one"])).toBe(false);
    expect(boards().requirements.nonFunctional).toEqual([]);
  });

  it("a non-empty unseeded list gets the flag but no items", () => {
    const own = store().addRequirement("nonFunctional", null, "mine");
    expect(store().seedNonFunctional(["seeded"])).toBe(false);
    expect(boards().requirements.nonFunctional).toEqual([{ id: own, text: "mine" }]);
    expect(boards().requirements.nonFunctionalSeeded).toBe(true);
  });

  it("is a no-op without an attached design", () => {
    useDesignStore.setState({ designId: null });
    const before = boards();
    expect(store().seedNonFunctional(["x"])).toBe(false);
    expect(boards()).toBe(before);
  });

  it("records no action", () => {
    withFakeTimers(() => {
      store().seedNonFunctional(["x"]);
      vi.advanceTimersByTime(2000);
      expect(log()).toEqual([]);
    });
  });
});

describe("entity actions", () => {
  it("add, rename, move", () => {
    const id = store().addEntity({ x: 10, y: 20 }, "User");
    const blank = store().addEntity({ x: 0, y: 0 });
    store().renameEntity(blank, "Order");
    store().moveEntity(id, { x: 50, y: 60 });
    expect(boards().entities.entities).toEqual([
      { id, name: "User", fields: [], position: { x: 50, y: 60 } },
      { id: blank, name: "Order", fields: [], position: { x: 0, y: 0 } },
    ]);
    const before = boards();
    store().moveEntity(id, { x: 50, y: 60 });
    store().moveEntity("nope", { x: 1, y: 1 });
    expect(boards()).toBe(before);
  });

  it("field add, insert-after, update, remove, move", () => {
    const e = store().addEntity({ x: 0, y: 0 }, "User");
    const f1 = store().addField(e, null, { name: "id", type: "uuid" })!;
    const f3 = store().addField(e, undefined, { name: "name" })!;
    const f2 = store().addField(e, f1, { name: "email", type: "string" })!;
    const fields = () => boards().entities.entities[0].fields;
    expect(fields().map((f) => f.name)).toEqual(["id", "email", "name"]);

    store().updateField(e, f3, { type: "string" });
    expect(fields()[2]).toEqual({ id: f3, name: "name", type: "string" });
    store().moveField(e, f3, 0);
    expect(fields().map((f) => f.id)).toEqual([f3, f1, f2]);
    store().removeField(e, f1);
    expect(fields().map((f) => f.id)).toEqual([f3, f2]);

    expect(store().addField("nope")).toBeNull();
    const before = boards();
    store().updateField("nope", f2, { name: "x" });
    store().removeField(e, "nope");
    expect(boards()).toBe(before);
  });

  it("removing an entity drops its relations (review focus 3)", () => {
    const a = store().addEntity({ x: 0, y: 0 }, "A");
    const b = store().addEntity({ x: 1, y: 0 }, "B");
    const c = store().addEntity({ x: 2, y: 0 }, "C");
    store().addRelation(a, b);
    store().addRelation(c, a);
    const keep = store().addRelation(b, c)!;
    store().removeEntity(a);
    expect(boards().entities.entities.map((e) => e.id)).toEqual([b, c]);
    expect(boards().entities.relations.map((r) => r.id)).toEqual([keep]);

    const record = buildDesignRecord("rec", "D", emptyGraph(), "practice", undefined, [], boards());
    const parsed = parseDesignRecord(JSON.stringify(record))!;
    expect(parsed.boards.entities.relations.some((r) => r.from === a || r.to === a)).toBe(false);
  });
});

describe("relation actions", () => {
  it("defaults, duplicates, unknown entities, self-relations, kind", () => {
    const a = store().addEntity({ x: 0, y: 0 }, "A");
    const b = store().addEntity({ x: 1, y: 0 }, "B");
    const r = store().addRelation(a, b)!;
    expect(boards().entities.relations).toEqual([{ id: r, from: a, to: b, kind: "one-to-many" }]);
    expect(store().addRelation(a, b)).toBeNull();
    expect(store().addRelation(b, a)).toBeNull();
    expect(store().addRelation(a, "nope")).toBeNull();
    expect(store().addRelation("nope", b)).toBeNull();
    const self = store().addRelation(a, a, "one-to-one");
    expect(self).not.toBeNull();

    store().setRelationKind(r, "many-to-many");
    expect(boards().entities.relations[0].kind).toBe("many-to-many");
  });

  it("repointRelation moves an end, no-op onto a duplicate pair", () => {
    const a = store().addEntity({ x: 0, y: 0 }, "A");
    const b = store().addEntity({ x: 1, y: 0 }, "B");
    const c = store().addEntity({ x: 2, y: 0 }, "C");
    const ab = store().addRelation(a, b)!;
    store().addRelation(c, a);
    store().repointRelation(ab, "to", c); // a–c already exists (as c→a)
    expect(boards().entities.relations[0]).toEqual({ id: ab, from: a, to: b, kind: "one-to-many" });
    store().repointRelation(ab, "from", c); // c→b is new
    expect(boards().entities.relations[0]).toEqual({ id: ab, from: c, to: b, kind: "one-to-many" });
    const before = boards();
    store().repointRelation(ab, "from", c);
    store().repointRelation(ab, "to", "nope");
    store().repointRelation("nope", "to", a);
    expect(boards()).toBe(before);
  });

  it("removeRelation", () => {
    const a = store().addEntity({ x: 0, y: 0 }, "A");
    const r = store().addRelation(a, a)!;
    store().removeRelation(r);
    expect(boards().entities.relations).toEqual([]);
  });
});

describe("endpoint actions", () => {
  it("defaults, at start, init, partial update, remove, move", () => {
    const e1 = store().addEndpoint();
    expect(boards().api.endpoints).toEqual([
      { id: e1, method: "GET", url: "", status: "200", requestBody: "", responseBody: "" },
    ]);
    const e0 = store().addEndpoint("start", { method: "POST", url: "/v1/orders", status: "201" });
    expect(boards().api.endpoints.map((e) => e.id)).toEqual([e0, e1]);
    expect(boards().api.endpoints[0]).toEqual({
      id: e0,
      method: "POST",
      url: "/v1/orders",
      status: "201",
      requestBody: "",
      responseBody: "",
    });

    store().updateEndpoint(e0, { url: undefined, requestBody: '{"items": [' });
    expect(boards().api.endpoints[0].url).toBe("/v1/orders");
    expect(boards().api.endpoints[0].requestBody).toBe('{"items": [');
    expect(Object.keys(boards().api.endpoints[0])).toEqual([
      "id",
      "method",
      "url",
      "status",
      "requestBody",
      "responseBody",
    ]);

    store().moveEndpoint(e0, 1);
    expect(boards().api.endpoints.map((e) => e.id)).toEqual([e1, e0]);
    store().removeEndpoint(e1);
    expect(boards().api.endpoints.map((e) => e.id)).toEqual([e0]);
  });
});

describe("board_edited action log", () => {
  it("one entry per burst", () => {
    withFakeTimers(() => {
      const id = store().addRequirement("functional");
      for (let i = 0; i < 5; i++) {
        store().updateRequirement("functional", id, `text ${i}`);
        vi.advanceTimersByTime(200);
      }
      vi.advanceTimersByTime(1000);
      expect(log()).toEqual([{ phase: "hld", kind: "board_edited", detail: "edited requirements" }]);
    });
  });

  it("edits on two boards give two entries", () => {
    withFakeTimers(() => {
      store().addRequirement("functional", null, "A");
      store().addEndpoint();
      vi.advanceTimersByTime(1000);
      expect(log()).toEqual([
        { phase: "hld", kind: "board_edited", detail: "edited requirements" },
        { phase: "hld", kind: "board_edited", detail: "edited API" },
      ]);
    });
  });

  it("moveEntity alone records nothing", () => {
    // seed an entity without a pending record, then drag it
    useDesignStore.setState({
      boards: {
        ...emptyBoards(),
        entities: { entities: [{ id: "e", name: "E", fields: [], position: { x: 0, y: 0 } }], relations: [] },
      },
    });
    withFakeTimers(() => {
      store().moveEntity("e", { x: 5, y: 5 });
      vi.advanceTimersByTime(2000);
      expect(log()).toEqual([]);
    });
  });

  it("a pending record is cancelled by attaching another design", () => {
    withFakeTimers(() => {
      store().addRequirement("functional", null, "A");
      store().attachDesign("other");
      vi.advanceTimersByTime(2000);
      expect(log()).toEqual([]);
      vi.advanceTimersByTime(600);
      expect(localStorage.getItem(designStorageKey("rec"))).toBeNull();
      store().attachDesign("rec");
      expect(log()).toEqual([]);
    });
  });
});

describe("autosave, attach and import", () => {
  it("autosaves boards and reloads them on attach", () => {
    withFakeTimers(() => {
      store().addRequirement("functional", null, "A");
      const e = store().addEntity({ x: 1, y: 2 }, "User");
      store().addField(e, null, { name: "id", type: "uuid" });
      store().addEndpoint("end", { url: "/x" });
      vi.advanceTimersByTime(600);
      const saved = boards();
      const stored = parseDesignRecord(localStorage.getItem(designStorageKey("rec"))!);
      expect(stored?.boards).toEqual(saved);

      store().attachDesign("other");
      expect(boards()).toEqual(emptyBoards());
      store().attachDesign("rec");
      expect(boards()).toEqual(saved);
    });
  });

  it("importRecord adopts record.boards", () => {
    const imported: DesignBoards = {
      ...emptyBoards(),
      api: {
        endpoints: [
          { id: "x", method: "DELETE", url: "/y", status: "204", requestBody: "", responseBody: "" },
        ],
      },
    };
    store().importRecord(buildDesignRecord("file", "F", emptyGraph(), "practice", undefined, [], imported));
    expect(boards()).toEqual(imported);
  });

  it("boards built through actions round-trip byte-identically", () => {
    store().seedNonFunctional(["p95 < 200 ms"]);
    const r = store().addRequirement("functional", null, "place order");
    store().updateRequirement("functional", r, "place an order");
    const a = store().addEntity({ x: 0, y: 0 }, "User");
    const b = store().addEntity({ x: 300, y: 10 }, "Order");
    const f = store().addField(a, null, { name: "id" })!;
    store().updateField(a, f, { type: "uuid" });
    store().addField(b, null, { type: "int" });
    const rel = store().addRelation(a, b)!;
    store().setRelationKind(rel, "one-to-one");
    store().moveEntity(b, { x: 320, y: 15.5 });
    const ep = store().addEndpoint("end", { method: "POST" });
    store().updateEndpoint(ep, { url: "/v1/orders", status: "", requestBody: '{"a": ' });

    const built = boards();
    const record = buildDesignRecord("rec", "D", emptyGraph(), "practice", undefined, [], built);
    const parsed = parseDesignRecord(JSON.stringify(record))!;
    expect(JSON.stringify(parsed.boards)).toBe(JSON.stringify(built));
  });
});
