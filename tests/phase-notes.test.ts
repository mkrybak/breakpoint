import { describe, expect, it } from "vitest";
import type { Scenario } from "../src/lib/core";
import { nfrNotesTemplate } from "../src/components/panels/PhaseNotes";

function scenarioFixture(overrides: Partial<Scenario["pass"]> = {}): Scenario {
  return {
    id: "s1",
    name: "Fixture",
    description: "",
    durationSec: 60,
    baseRps: 5000,
    readRatio: 0.8,
    timeline: [],
    pass: { p95Ms: 200, maxErrorRate: 0.01, ...overrides },
    seed: 1,
  };
}

describe("nfrNotesTemplate", () => {
  it("renders the NFR values as markdown (eventual by default)", () => {
    expect(nfrNotesTemplate(scenarioFixture())).toBe(
      [
        "## Non-functional requirements",
        "- Target load: 5000 RPS",
        "- p95 latency budget: 200 ms",
        "- Max error rate: 1%",
        "- Consistency: Eventual",
        "",
        "## Functional requirements",
        "- ",
        "",
      ].join("\n"),
    );
  });

  it("reflects a strong-consistency NFR and fractional error rate", () => {
    const md = nfrNotesTemplate(
      scenarioFixture({ maxErrorRate: 0.005, consistency: "strong" }),
    );
    expect(md).toContain("- Max error rate: 0.5%");
    expect(md).toContain("- Consistency: Strong");
  });
});
