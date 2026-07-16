import { beforeEach, describe, expect, it } from "vitest";
import {
  CANVAS_UNLOCK_PHASE,
  PHASES,
  formatClock,
  isCanvasLocked,
  nextPhase,
  phaseConfig,
  phaseIndex,
  usePhaseStore,
} from "../src/stores/phase-store";

beforeEach(() => {
  usePhaseStore.getState().reset();
});

describe("phase helpers", () => {
  it("orders the five interview phases with their budgets", () => {
    expect(PHASES.map((p) => p.phase)).toEqual([
      "requirements",
      "entities",
      "api",
      "hld",
      "deepdive",
    ]);
    expect(PHASES.map((p) => p.durationSec)).toEqual([300, 120, 300, 900, 600]);
  });

  it("phaseIndex / phaseConfig / nextPhase walk the flow", () => {
    expect(phaseIndex("requirements")).toBe(0);
    expect(phaseIndex("deepdive")).toBe(4);
    expect(phaseConfig("hld").durationSec).toBe(900);
    expect(nextPhase("requirements")).toBe("entities");
    expect(nextPhase("deepdive")).toBeNull();
  });

  it("locks the canvas before HLD, unlocks from HLD on", () => {
    expect(CANVAS_UNLOCK_PHASE).toBe("hld");
    expect(isCanvasLocked("requirements")).toBe(true);
    expect(isCanvasLocked("entities")).toBe(true);
    expect(isCanvasLocked("api")).toBe(true);
    expect(isCanvasLocked("hld")).toBe(false);
    expect(isCanvasLocked("deepdive")).toBe(false);
  });

  it("formats a clock as mm:ss and clamps at zero", () => {
    expect(formatClock(300)).toBe("05:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(9)).toBe("00:09");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("phase store", () => {
  it("starts at requirements with its full budget, running", () => {
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("requirements");
    expect(s.remainingSec).toBe(300);
    expect(s.running).toBe(true);
  });

  it("tick decrements the countdown", () => {
    usePhaseStore.getState().tick();
    expect(usePhaseStore.getState().remainingSec).toBe(299);
  });

  it("tick at the boundary advances to the next phase with a fresh budget", () => {
    // Drain requirements (300s) to zero: the 300th tick advances to entities.
    for (let i = 0; i < 300; i++) usePhaseStore.getState().tick();
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("entities");
    expect(s.remainingSec).toBe(120);
    expect(s.running).toBe(true);
  });

  it("tick past the last phase stops at zero", () => {
    usePhaseStore.setState({ phase: "deepdive", remainingSec: 1, running: true });
    usePhaseStore.getState().tick();
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("deepdive");
    expect(s.remainingSec).toBe(0);
    expect(s.running).toBe(false);
  });

  it("tick is a no-op while paused", () => {
    usePhaseStore.getState().toggleRunning();
    usePhaseStore.getState().tick();
    const s = usePhaseStore.getState();
    expect(s.running).toBe(false);
    expect(s.remainingSec).toBe(300);
  });

  it("skip jumps to the next phase with a fresh budget", () => {
    usePhaseStore.getState().skip();
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("entities");
    expect(s.remainingSec).toBe(120);
  });

  it("skip on the last phase finishes the interview", () => {
    usePhaseStore.setState({ phase: "deepdive", remainingSec: 42, running: true });
    usePhaseStore.getState().skip();
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("deepdive");
    expect(s.remainingSec).toBe(0);
    expect(s.running).toBe(false);
  });

  it("extend adds seconds to the current phase", () => {
    usePhaseStore.getState().extend(60);
    expect(usePhaseStore.getState().remainingSec).toBe(360);
  });

  it("reset returns to the first phase, full budget, running", () => {
    usePhaseStore.getState().skip();
    usePhaseStore.getState().toggleRunning();
    usePhaseStore.getState().reset();
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("requirements");
    expect(s.remainingSec).toBe(300);
    expect(s.running).toBe(true);
  });

  it("elapsedSec advances one per running tick and not while paused", () => {
    usePhaseStore.getState().tick();
    usePhaseStore.getState().tick();
    expect(usePhaseStore.getState().elapsedSec).toBe(2);

    usePhaseStore.getState().toggleRunning(); // pause
    usePhaseStore.getState().tick();
    expect(usePhaseStore.getState().elapsedSec).toBe(2);
  });

  it("reset clears the interview clock", () => {
    usePhaseStore.getState().tick();
    usePhaseStore.getState().reset();
    expect(usePhaseStore.getState().elapsedSec).toBe(0);
  });
});
