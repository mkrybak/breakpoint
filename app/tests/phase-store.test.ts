import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_UNLOCK_PHASE,
  PHASES,
  formatClock,
  hasStepBoard,
  isCanvasLocked,
  nextPhase,
  phaseConfig,
  phaseIndex,
  usePhaseStore,
  viewReturn,
} from "../src/stores/phase-store";

beforeEach(() => {
  usePhaseStore.getState().detach();
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

describe("persistence (T-12.7)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attach with nothing saved starts a fresh clock and does not write", () => {
    usePhaseStore.getState().attach("p1");
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("requirements");
    expect(s.remainingSec).toBe(300);
    expect(s.elapsedSec).toBe(0);
    expect(s.running).toBe(true);
    expect(s.designId).toBe("p1");
    expect(localStorage.getItem("bp:phase:p1")).toBeNull();
  });

  it("attach restores a saved clock (canvas unlocked in HLD)", () => {
    localStorage.setItem(
      "bp:phase:p1",
      JSON.stringify({
        phase: "hld",
        remainingSec: 600,
        elapsedSec: 720,
        running: true,
      }),
    );
    usePhaseStore.getState().attach("p1");
    const s = usePhaseStore.getState();
    expect(s.phase).toBe("hld");
    expect(s.remainingSec).toBe(600);
    expect(s.elapsedSec).toBe(720);
    expect(s.running).toBe(true);
    expect(isCanvasLocked(s.phase)).toBe(false);
  });

  it("saves every clock change of the attached design", () => {
    usePhaseStore.getState().attach("p1");
    usePhaseStore.getState().skip();
    usePhaseStore.getState().skip();
    usePhaseStore.getState().skip();
    usePhaseStore.getState().tick();
    expect(JSON.parse(localStorage.getItem("bp:phase:p1") ?? "null")).toEqual({
      phase: "hld",
      remainingSec: 899,
      elapsedSec: 1,
      running: true,
    });
  });

  it("saves nothing while detached", () => {
    usePhaseStore.getState().attach("p1");
    usePhaseStore.getState().detach();
    usePhaseStore.getState().skip();
    expect(localStorage.getItem("bp:phase:p1")).toBeNull();
  });

  it("reset keeps the attached design", () => {
    usePhaseStore.getState().attach("p1");
    usePhaseStore.getState().reset();
    expect(usePhaseStore.getState().designId).toBe("p1");
  });

  it("attach views the restored clock's step (T-13.2)", () => {
    localStorage.setItem(
      "bp:phase:p1",
      JSON.stringify({
        phase: "hld",
        remainingSec: 600,
        elapsedSec: 720,
        running: true,
      }),
    );
    usePhaseStore.getState().attach("p1");
    expect(usePhaseStore.getState().viewedPhase).toBe("hld");
  });

  it("viewing an earlier step writes nothing; the saved shape is clock-only (T-13.2)", () => {
    usePhaseStore.getState().attach("p1");
    usePhaseStore.getState().skip();
    const saved = localStorage.getItem("bp:phase:p1");
    usePhaseStore.getState().goToStep("requirements");
    expect(localStorage.getItem("bp:phase:p1")).toBe(saved);
    expect(Object.keys(JSON.parse(saved ?? "{}")).sort()).toEqual(
      ["elapsedSec", "phase", "remainingSec", "running"],
    );
  });
});

describe("viewed step (T-13.2)", () => {
  const st = () => usePhaseStore.getState();
  const ret = () => viewReturn(st());

  it("a fresh store views requirements, not auto-advanced", () => {
    expect(st().viewedPhase).toBe("requirements");
    expect(st().autoAdvanced).toBe(false);
  });

  it("going back views the earlier step while the clock stays and keeps ticking", () => {
    st().skip();
    st().goToStep("requirements");
    expect(st().phase).toBe("entities");
    expect(st().remainingSec).toBe(120);
    expect(st().viewedPhase).toBe("requirements");
    st().tick();
    expect(st().remainingSec).toBe(119);
    expect(st().viewedPhase).toBe("requirements");
  });

  it("going to the current step returns the view", () => {
    st().skip();
    st().goToStep("requirements");
    st().goToStep("entities");
    expect(st().viewedPhase).toBe(st().phase);
    expect(ret()).toBeNull();
  });

  it("a later step jumps the clock there with its full budget and keeps running as is", () => {
    st().toggleRunning();
    st().goToStep("hld");
    expect(st().phase).toBe("hld");
    expect(st().remainingSec).toBe(900);
    expect(st().viewedPhase).toBe("hld");
    expect(st().running).toBe(false);
  });

  it("a timeout advances the clock but not the view, and raises the nudge", () => {
    for (let i = 0; i < 300; i++) st().tick();
    expect(st().phase).toBe("entities");
    expect(st().viewedPhase).toBe("requirements");
    expect(st().autoAdvanced).toBe(true);
    expect(ret()).toEqual({ kind: "nudge", phase: "entities" });
  });

  it("a boundary passing while viewing back switches the back chip to the nudge", () => {
    st().skip();
    st().goToStep("requirements");
    expect(ret()).toEqual({ kind: "back", phase: "entities" });
    for (let i = 0; i < 120; i++) st().tick();
    expect(st().phase).toBe("api");
    expect(st().viewedPhase).toBe("requirements");
    expect(ret()).toEqual({ kind: "nudge", phase: "api" });
  });

  it("skip after an auto-advance moves the view and clears the nudge", () => {
    for (let i = 0; i < 300; i++) st().tick();
    st().skip();
    expect(st().viewedPhase).toBe(st().phase);
    expect(st().autoAdvanced).toBe(false);
  });

  it("reset after viewing back returns the view to requirements", () => {
    st().skip();
    st().goToStep("requirements");
    for (let i = 0; i < 120; i++) st().tick();
    st().reset();
    expect(st().viewedPhase).toBe("requirements");
    expect(st().autoAdvanced).toBe(false);
  });

  it("hasStepBoard is true before High-level design only", () => {
    expect(hasStepBoard("requirements")).toBe(true);
    expect(hasStepBoard("entities")).toBe(true);
    expect(hasStepBoard("api")).toBe(true);
    expect(hasStepBoard("hld")).toBe(false);
    expect(hasStepBoard("deepdive")).toBe(false);
  });
});
