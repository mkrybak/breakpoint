import { create } from "zustand";
import type {
  DesignGraph,
  RunResult,
  Scenario,
  SimFrame,
  StressRule,
} from "@/lib/core";
import { createSimWorker } from "@/lib/simulation";
import type { SimWorkerHandle, WorkerToMain } from "@/lib/simulation";

export type SimStatus = "idle" | "running" | "paused" | "done";

/** One event-log line, tagged with the sim time it was emitted. */
export interface SimLogEntry {
  t: number;
  message: string;
}

/** Derived scalar summary of the run, folded one frame at a time. */
export interface SimAggregates {
  /** latest frame's t in seconds (0 before the first frame) */
  elapsedSec: number;
  /** latest-frame scalars */
  p95Ms: number;
  errorRate: number;
  servedRps: number;
  /** run-so-far peaks */
  peakP95Ms: number;
  peakErrorRate: number;
  /** highest-util node in the latest frame; ties broken by runGraph node order */
  bottleneckNodeId: string | null;
  bottleneckUtil: number;
}

/** Live event-log cap. The full history stays in `frames[i].events`. */
export const LOG_LIMIT = 200;

/** How the store obtains a worker transport — real in the app, fake in tests. */
export type SimWorkerFactory = (
  onMessage: (msg: WorkerToMain) => void,
) => SimWorkerHandle;

function emptyAggregates(): SimAggregates {
  return {
    elapsedSec: 0,
    p95Ms: 0,
    errorRate: 0,
    servedRps: 0,
    peakP95Ms: 0,
    peakErrorRate: 0,
    bottleneckNodeId: null,
    bottleneckUtil: 0,
  };
}

/** Pure: fold one frame into the running aggregates. */
export function foldAggregates(
  prev: SimAggregates,
  frame: SimFrame,
  nodeOrder: readonly string[],
): SimAggregates {
  let bottleneckNodeId: string | null = null;
  let bottleneckUtil = -1;
  for (const id of nodeOrder) {
    const util = frame.perNode[id]?.util ?? 0;
    if (util > bottleneckUtil) {
      bottleneckUtil = util;
      bottleneckNodeId = id;
    }
  }
  return {
    elapsedSec: frame.t,
    p95Ms: frame.p95Ms,
    errorRate: frame.errorRate,
    servedRps: frame.servedRps,
    peakP95Ms: Math.max(prev.peakP95Ms, frame.p95Ms),
    peakErrorRate: Math.max(prev.peakErrorRate, frame.errorRate),
    bottleneckNodeId,
    bottleneckUtil: bottleneckUtil < 0 ? 0 : bottleneckUtil,
  };
}

/** Pure: append a frame's events, ring-buffered to `limit` (newest kept). */
export function appendLog(
  prev: SimLogEntry[],
  frame: SimFrame,
  limit = LOG_LIMIT,
): SimLogEntry[] {
  if (frame.events.length === 0) return prev;
  const next = [
    ...prev,
    ...frame.events.map((message) => ({ t: frame.t, message })),
  ];
  return next.length > limit ? next.slice(-limit) : next;
}

/** Event-log line for an interviewer-injected chaos rule. */
export function describeChaos(rule: StressRule): string {
  switch (rule.rule) {
    case "kill":
      return `⚡ chaos: killed ${rule.count ?? 1} × ${rule.target}`;
    case "flush":
      return "⚡ chaos: flushed cache";
    case "spike":
      return `⚡ chaos: spike ×${rule.factor}`;
    case "ramp":
      return `⚡ chaos: ramp → ${rule.toRps} rps`;
    case "partition":
      return `⚡ chaos: partition ${rule.target}`;
    case "hotkey":
      return `⚡ chaos: hotkey skew ${rule.skew}`;
  }
}

interface SimStore {
  status: SimStatus;
  /** the full run — every streamed frame, kept for replay (T-3.5) */
  frames: SimFrame[];
  /** the most recent frame, for live node/edge viz (T-3.3); null before a run */
  latestFrame: SimFrame | null;
  /** derived scalar summary for the HUD (T-3.4) */
  aggregates: SimAggregates;
  /** recent event-log lines, ring-buffered to LOG_LIMIT */
  log: SimLogEntry[];
  /** verdict + full frames, set when the run completes */
  result: RunResult | null;
  /** replay: index into `frames` currently shown on the canvas; null = live/last */
  replayIndex: number | null;
  /** frozen inputs of the active/last run */
  runGraph: DesignGraph | null;
  runScenario: Scenario | null;

  run: (graph: DesignGraph, scenario: Scenario) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  chaos: (rule: StressRule) => void;
  scrubTo: (index: number) => void;
  reset: () => void;
}

// The worker transport is per-session and non-serializable, so it lives beside
// the store (like design-store's autosaveTimer), not inside zustand state.
let workerFactory: SimWorkerFactory = createSimWorker;
let handle: SimWorkerHandle | null = null;

/** Test seam: swap the worker transport (a createWorkerHost-backed fake). */
export function setSimWorkerFactory(factory: SimWorkerFactory): void {
  workerFactory = factory;
}

function disposeWorker(): void {
  handle?.dispose();
  handle = null;
}

const IDLE = {
  status: "idle" as SimStatus,
  frames: [] as SimFrame[],
  latestFrame: null,
  aggregates: emptyAggregates(),
  log: [] as SimLogEntry[],
  result: null,
  replayIndex: null,
  runGraph: null,
  runScenario: null,
};

export const useSimStore = create<SimStore>((set, get) => {
  const onMessage = (msg: WorkerToMain) => {
    if (msg.type === "frame") {
      set((s) => ({
        frames: [...s.frames, msg.frame],
        latestFrame: msg.frame,
        aggregates: foldAggregates(
          s.aggregates,
          msg.frame,
          s.runGraph?.nodes.map((n) => n.id) ?? [],
        ),
        log: appendLog(s.log, msg.frame),
      }));
    } else {
      // "done": the worker's single completion path (finished, stopped, or 0-duration)
      disposeWorker();
      set((s) => ({
        status: "done",
        result: msg.result,
        replayIndex: s.frames.length > 0 ? s.frames.length - 1 : null,
      }));
    }
  };

  return {
    ...IDLE,

    run: (graph, scenario) => {
      disposeWorker();
      handle = workerFactory(onMessage);
      set({
        ...IDLE,
        status: "running",
        runGraph: graph,
        runScenario: scenario,
      });
      handle.post({ type: "run", graph, scenario });
    },

    pause: () => {
      if (get().status !== "running") return;
      handle?.post({ type: "pause" });
      set({ status: "paused" });
    },

    resume: () => {
      if (get().status !== "paused") return;
      handle?.post({ type: "resume" });
      set({ status: "running" });
    },

    stop: () => {
      const { status } = get();
      if (status !== "running" && status !== "paused") return;
      handle?.post({ type: "stop" });
      // the worker replies "done"; onMessage sets status + result.
    },

    chaos: (rule) => {
      const { status } = get();
      if (status !== "running" && status !== "paused") return;
      handle?.post({ type: "chaos", rule });
      set((s) => {
        const entry: SimLogEntry = {
          t: s.aggregates.elapsedSec,
          message: describeChaos(rule),
        };
        const next = [...s.log, entry];
        return { log: next.length > LOG_LIMIT ? next.slice(-LOG_LIMIT) : next };
      });
    },

    scrubTo: (index) => {
      const { frames } = get();
      if (frames.length === 0) return;
      const clamped = Math.min(Math.max(index, 0), frames.length - 1);
      // Repoint latestFrame at a past frame — ComponentNode/FlowEdge subscribe to
      // it, so the canvas re-renders that tick with no change to those components.
      set({ replayIndex: clamped, latestFrame: frames[clamped] });
    },

    reset: () => {
      disposeWorker();
      set({ ...IDLE });
    },
  };
});
