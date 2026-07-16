import { describe, expect, it } from "vitest";
import type { DesignGraph, StressRule } from "../src/lib/core";
import {
  describeStressRule,
  getScenarioPreset,
  listScenarioPresets,
  parseScenario,
  SCENARIO_PRESETS,
} from "../src/lib/scenarios";
import { runSimulation } from "../src/lib/simulation";

const ruleKinds = (timeline: StressRule[]) =>
  timeline.map((rule) => rule.rule).sort();

describe("scenario presets", () => {
  it("ships exactly the three M3 presets in order", () => {
    expect(SCENARIO_PRESETS.map((s) => s.id)).toEqual([
      "black-friday",
      "celebrity-tweet",
      "az-outage",
    ]);
  });

  it("each preset carries the stress rules its brief requires", () => {
    expect(ruleKinds(getScenarioPreset("black-friday")!.timeline)).toEqual([
      "ramp",
      "spike",
    ]);
    expect(ruleKinds(getScenarioPreset("celebrity-tweet")!.timeline)).toEqual([
      "hotkey",
      "spike",
    ]);
    expect(ruleKinds(getScenarioPreset("az-outage")!.timeline)).toEqual([
      "kill",
      "partition",
    ]);
  });

  it("getScenarioPreset returns undefined for an unknown id", () => {
    expect(getScenarioPreset("nope")).toBeUndefined();
  });

  it("every preset runs headless to a full frame array with a verdict", () => {
    const graph: DesignGraph = {
      entryNodeId: "c",
      nodes: [
        { id: "c", kind: "client", label: "c", position: { x: 0, y: 0 }, config: {} },
        { id: "app", kind: "app_server", label: "app", position: { x: 0, y: 0 }, config: { replicas: 4 } },
        { id: "cache", kind: "cache", label: "cache", position: { x: 0, y: 0 }, config: { hitRate: 0.8 } },
        { id: "db", kind: "db_sql", label: "db", position: { x: 0, y: 0 }, config: { replicas: 1 } },
      ],
      edges: [
        { id: "e1", source: "c", target: "app", trafficShare: 1, kind: "sync" },
        { id: "e2", source: "app", target: "cache", trafficShare: 1, kind: "sync" },
        { id: "e3", source: "cache", target: "db", trafficShare: 1, kind: "sync" },
      ],
    };
    for (const preset of listScenarioPresets()) {
      const result = runSimulation(graph, preset);
      expect(result.frames.length).toBe(preset.durationSec * 10);
      expect(result.verdict).toHaveProperty("passed");
    }
  });
});

describe("parseScenario", () => {
  const valid = SCENARIO_PRESETS[0];

  it("accepts a well-formed scenario", () => {
    expect(parseScenario(structuredClone(valid))).toEqual(valid);
  });

  it("rejects a missing required field", () => {
    const bad = structuredClone(valid) as unknown as Record<string, unknown>;
    delete bad.baseRps;
    expect(parseScenario(bad)).toBeNull();
  });

  it("rejects an unknown rule kind", () => {
    const bad = structuredClone(valid);
    (bad.timeline as unknown[]).push({ at: 5, rule: "meteor", forSec: 3 });
    expect(parseScenario(bad)).toBeNull();
  });

  it("rejects a rule missing a field", () => {
    expect(
      parseScenario({ ...valid, timeline: [{ at: 5, rule: "spike" }] }),
    ).toBeNull();
  });

  it("rejects a non-strong consistency value", () => {
    expect(
      parseScenario({ ...valid, pass: { ...valid.pass, consistency: "eventual" } }),
    ).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseScenario(null)).toBeNull();
    expect(parseScenario("scenario")).toBeNull();
  });
});

describe("describeStressRule", () => {
  it("renders one golden line per rule kind", () => {
    expect(describeStressRule({ at: 10, rule: "ramp", toRps: 20000, overSec: 20 })).toBe(
      "at 10s — ramp to 20000 RPS over 20s",
    );
    expect(describeStressRule({ at: 45, rule: "spike", factor: 1.5, forSec: 10 })).toBe(
      "at 45s — spike ×1.5 for 10s",
    );
    expect(describeStressRule({ at: 15, rule: "kill", target: "app_server", count: 2 })).toBe(
      "at 15s — kill 2 × app_server",
    );
    expect(describeStressRule({ at: 15, rule: "kill", target: "app_server" })).toBe(
      "at 15s — kill 1 × app_server",
    );
    expect(describeStressRule({ at: 0, rule: "flush", target: "cache" })).toBe(
      "at 0s — flush cache",
    );
    expect(describeStressRule({ at: 15, rule: "partition", target: "db_sql", forSec: 20 })).toBe(
      "at 15s — partition db_sql for 20s",
    );
    expect(describeStressRule({ at: 10, rule: "hotkey", skew: 0.5, forSec: 40 })).toBe(
      "at 10s — hotkey skew 0.5 for 40s",
    );
  });
});
