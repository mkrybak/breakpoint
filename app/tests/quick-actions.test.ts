import { describe, expect, it } from "vitest";
import {
  leaveQuickMode,
  switchQuickScenario,
} from "@/components/quick/quick-actions";
import { SCENARIO_PRESETS, STARTER_SCENARIO } from "@/lib/scenarios";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

describe("quick scenario lifecycle (T-7.5)", () => {
  it("switching clones the scenario and clears the last run; leaving restores Practice's preset", () => {
    useSimStore.setState({ status: "done" });
    switchQuickScenario(STARTER_SCENARIO);

    const { scenario } = useScenarioStore.getState();
    expect(scenario).toEqual(STARTER_SCENARIO);
    expect(scenario).not.toBe(STARTER_SCENARIO);
    expect(useSimStore.getState().status).toBe("idle");

    useSimStore.setState({ status: "done" });
    leaveQuickMode();
    expect(useScenarioStore.getState().scenario.id).toBe(
      SCENARIO_PRESETS[0].id,
    );
    expect(useSimStore.getState().status).toBe("idle");
  });
});
