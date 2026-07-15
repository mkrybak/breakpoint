import type {
  DesignGraph,
  RunResult,
  Scenario,
  SimFrame,
  StressRule,
} from "@/lib/core";
import { createSimRun, TICKS_PER_SEC, type SimRun } from "./engine";
import { createRuleEngine, type RuleEngine } from "./rules";
import { buildRunResult } from "./run";

/** main → worker (03-simulation-engine "Worker interface") */
export type MainToWorker =
  | { type: "run"; graph: DesignGraph; scenario: Scenario }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | {
      /**
       * Interviewer's live chaos button. The rule's `at` is ignored — the
       * host re-anchors it to the current sim time so it fires immediately.
       */
      type: "chaos";
      rule: StressRule;
    };

/** worker → main */
export type WorkerToMain =
  | { type: "frame"; frame: SimFrame }
  | { type: "done"; result: RunResult };

export interface WorkerHost {
  handle(msg: MainToWorker): void;
}

/** real-time pacing: one tick per 100 ms */
const TICK_MS = 1000 / TICKS_PER_SEC;

interface ActiveRun {
  graph: DesignGraph;
  scenario: Scenario;
  run: SimRun;
  rules: RuleEngine;
  frames: SimFrame[];
  tickCount: number;
  timer: ReturnType<typeof setInterval> | null;
}

/**
 * The worker's protocol brain, pure of any worker global so tests drive it
 * directly: `post` is `self.postMessage` in the real worker (worker.ts), a
 * collecting array in tests. Frames stream at real-time pace (10/s). One
 * completion path: `done` always carries a RunResult with the verdict over
 * whatever frames exist — `stop` just finalizes early. A new `run` replaces
 * the active one silently; messages without an active run are ignored.
 */
export function createWorkerHost(
  post: (msg: WorkerToMain) => void,
): WorkerHost {
  let active: ActiveRun | null = null;

  const stopTimer = () => {
    if (active?.timer != null) {
      clearInterval(active.timer);
      active.timer = null;
    }
  };

  const finish = () => {
    if (!active) return;
    stopTimer();
    const { graph, scenario, frames } = active;
    active = null;
    post({ type: "done", result: buildRunResult(graph, scenario, frames) });
  };

  const onTick = () => {
    if (!active) return;
    const frame = active.run.tick();
    if (frame === null) {
      finish();
      return;
    }
    active.frames.push(frame);
    post({ type: "frame", frame });
    if (active.frames.length >= active.tickCount) finish();
  };

  const start = () => {
    if (active && active.timer == null) {
      active.timer = setInterval(onTick, TICK_MS);
    }
  };

  return {
    handle(msg) {
      switch (msg.type) {
        case "run": {
          stopTimer(); // a new run replaces the current one — no done for it
          const rules = createRuleEngine(msg.graph, msg.scenario);
          active = {
            graph: msg.graph,
            scenario: msg.scenario,
            rules,
            run: createSimRun(msg.graph, msg.scenario, rules.apply),
            frames: [],
            tickCount: Math.max(
              0,
              Math.round(msg.scenario.durationSec * TICKS_PER_SEC),
            ),
            timer: null,
          };
          if (active.tickCount === 0) finish();
          else start();
          break;
        }
        case "pause":
          stopTimer();
          break;
        case "resume":
          start();
          break;
        case "stop":
          finish();
          break;
        case "chaos":
          if (active) {
            active.rules.inject({
              ...msg.rule,
              at: active.frames.length / TICKS_PER_SEC,
            });
          }
          break;
      }
    },
  };
}
