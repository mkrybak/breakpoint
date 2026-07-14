import { describe, expect, it } from "vitest";
import type { DesignNode } from "../src/lib/core";
import { getComponentDef } from "../src/lib/registry";
import {
  flowRps,
  splitFlow,
  zeroFlow,
  type Flow,
} from "../src/lib/simulation/engine";
import {
  formatRps,
  getNodeModel,
  transitionEvent,
  type NodeModelOutput,
} from "../src/lib/simulation/node-models";

function node(
  id: string,
  kind: DesignNode["kind"] = "app_server",
  config: DesignNode["config"] = {},
): DesignNode {
  return { id, kind, label: id, position: { x: 0, y: 0 }, config };
}

/** Run the model over consecutive ticks, feeding the queue backlog forward. */
function runTicks(
  n: DesignNode,
  inflows: Flow[],
  aliveFraction = 1,
): NodeModelOutput[] {
  const def = getComponentDef(n.kind);
  const model = getNodeModel(n.kind);
  let queuedPrev = zeroFlow();
  return inflows.map((inflow) => {
    const out = model({ node: n, def, inflow, queuedPrev, aliveFraction });
    queuedPrev = out.queued;
    return out;
  });
}

function tick(n: DesignNode, inflow: Flow, aliveFraction = 1): NodeModelOutput {
  return runTicks(n, [inflow], aliveFraction)[0];
}

describe("golden 1 — capacity, queue, drop", () => {
  it("5k RPS into a 4k app server: served 4k, queue fills to 2k, drops begin at tick 2", () => {
    const inflow: Flow = { read: 5000, write: 0 };
    const ticks = runTicks(node("app"), [inflow, inflow, inflow, inflow]);
    expect(ticks.map((t) => t.served)).toEqual([
      { read: 4000, write: 0 },
      { read: 4000, write: 0 },
      { read: 4000, write: 0 },
      { read: 4000, write: 0 },
    ]);
    // maxQueue = 0.5s × 4000 = 2000
    expect(ticks.map((t) => t.queued)).toEqual([
      { read: 1000, write: 0 },
      { read: 2000, write: 0 },
      { read: 2000, write: 0 },
      { read: 2000, write: 0 },
    ]);
    expect(ticks.map((t) => t.dropped)).toEqual([0, 0, 1000, 1000]);
    expect(ticks.map((t) => t.util)).toEqual([1.25, 1.5, 1.75, 1.75]);
    expect(ticks.map((t) => t.state)).toEqual([
      "overloaded",
      "overloaded",
      "overloaded",
      "overloaded",
    ]);
  });
});

describe("golden 3 — kill 1 of 2 servers", () => {
  it("util doubles the tick after aliveFraction halves", () => {
    const app = node("app", "app_server", { replicas: 2 });
    const def = getComponentDef("app_server");
    const model = getNodeModel("app_server");
    const inflow = splitFlow(4000, 0.75);
    const before = model({
      node: app,
      def,
      inflow,
      queuedPrev: zeroFlow(),
      aliveFraction: 1,
    });
    expect(before.util).toBe(0.5);
    expect(before.state).toBe("ok");
    const after = model({
      node: app,
      def,
      inflow,
      queuedPrev: before.queued,
      aliveFraction: 0.5,
    });
    expect(after.util).toBe(1);
    expect(after.state).toBe("saturated");
    expect(after.served).toEqual({ read: 3000, write: 1000 });
    expect(
      transitionEvent(app.label, after.state, flowRps(after.served)),
    ).toBe("app saturated at 4k RPS");
  });
});

describe("effectiveCapacity", () => {
  it("replicas multiply capacity for horizontal kinds", () => {
    const out = tick(node("app", "app_server", { replicas: 3 }), {
      read: 12000,
      write: 0,
    });
    expect(out.util).toBe(1);
    expect(out.served).toEqual({ read: 12000, write: 0 });
  });

  it("aliveFraction scales capacity", () => {
    const out = tick(node("app"), { read: 2000, write: 0 }, 0.5);
    // 2000 / (4000 × 0.5)
    expect(out.util).toBe(1);
  });

  it("db_sql reads scale with read replicas, writes stay at the primary ceiling", () => {
    const db = node("db", "db_sql", { replicas: 2 });
    const reads = tick(db, { read: 90000, write: 0 });
    expect(reads.util).toBe(1);
    expect(reads.served).toEqual({ read: 90000, write: 0 });
    const writes = tick(db, { read: 0, write: 20000 });
    expect(writes.served).toEqual({ read: 0, write: 15000 });
    expect(writes.util).toBe(20000 / 15000);
    expect(writes.state).toBe("overloaded");
    // maxQueue = 0.5 × (90000 + 15000) absorbs the 5000 overflow
    expect(writes.queued).toEqual({ read: 0, write: 5000 });
    expect(writes.dropped).toBe(0);
  });

  it("db_sql default config (0 read replicas) keeps the base 30k read ceiling", () => {
    const out = tick(node("db", "db_sql"), { read: 30000, write: 0 });
    expect(out.util).toBe(1);
  });

  it("sharded db_sql scales the write ceiling by the same unit count", () => {
    const db = node("db", "db_sql", { replicas: 2, sharded: true });
    const out = tick(db, { read: 0, write: 45000 });
    expect(out.util).toBe(1);
    expect(out.served).toEqual({ read: 0, write: 45000 });
  });

  it("ignores a non-boolean sharded value", () => {
    const db = node("db", "db_sql", { replicas: 2, sharded: "yes" });
    const out = tick(db, { read: 0, write: 20000 });
    expect(out.served).toEqual({ read: 0, write: 15000 });
  });

  it("unlimited-capacity kinds serve everything at util 0", () => {
    const out = tick(node("b", "blob"), { read: 1e9, write: 1e9 });
    expect(out.served).toEqual({ read: 1e9, write: 1e9 });
    expect(out.util).toBe(0);
    expect(out.queued).toEqual(zeroFlow());
    expect(out.dropped).toBe(0);
    expect(out.state).toBe("ok");
  });
});

describe("serve math", () => {
  it("caps total-regime flow proportionally with an exact total", () => {
    const out = tick(node("app"), { read: 4800, write: 1200 });
    expect(out.served).toEqual({ read: 3200, write: 800 });
    expect(flowRps(out.served)).toBe(4000);
  });

  it("splits queue overflow proportionally with an exact total", () => {
    const out = tick(node("app"), { read: 6000, write: 2000 });
    // served 4000 (k = 0.5) → overflow {3000, 1000}; maxQueue 2000 → qk = 0.5
    expect(out.served).toEqual({ read: 3000, write: 1000 });
    expect(out.queued).toEqual({ read: 1500, write: 500 });
    expect(out.dropped).toBe(2000);
  });

  it("serves zero on zero demand", () => {
    expect(tick(node("app"), zeroFlow())).toEqual({
      served: zeroFlow(),
      queued: zeroFlow(),
      dropped: 0,
      util: 0,
      state: "ok",
    });
  });
});

describe("state thresholds", () => {
  it.each([
    [2400, "ok"],
    [2800, "hot"],
    [3600, "saturated"],
    [4000, "saturated"],
    [4400, "overloaded"],
  ])("demand %i on 4k capacity → %s", (read, state) => {
    expect(tick(node("app"), { read, write: 0 }).state).toBe(state);
  });

  it("aliveFraction 0 = down: capacity 0, queue 0, everything drops", () => {
    const out = tick(node("app"), { read: 1000, write: 0 }, 0);
    expect(out.served).toEqual(zeroFlow());
    expect(out.queued).toEqual(zeroFlow());
    expect(out.dropped).toBe(1000);
    expect(out.util).toBe(0);
    expect(out.state).toBe("down");
  });
});

describe("transition events", () => {
  it("formats RPS deterministically", () => {
    expect(formatRps(8200)).toBe("8.2k");
    expect(formatRps(4000)).toBe("4k");
    expect(formatRps(950)).toBe("950");
  });

  it("renders a message per target state", () => {
    expect(transitionEvent("Postgres", "saturated", 8200)).toBe(
      "Postgres saturated at 8.2k RPS",
    );
    expect(transitionEvent("App-2", "down", 0)).toBe("App-2 down");
    expect(transitionEvent("App", "overloaded", 4000)).toBe(
      "App overloaded at 4k RPS — shedding load",
    );
    expect(transitionEvent("App", "hot", 3000)).toBe("App running hot");
    expect(transitionEvent("App", "ok", 1000)).toBe("App recovered");
  });
});
