"use client";

import { useEffect } from "react";
import { ChevronRight, Pause, Play, Plus } from "lucide-react";
import {
  PHASES,
  formatClock,
  phaseIndex,
  usePhaseStore,
} from "@/stores/phase-store";

const BTN =
  "flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";

export function PhaseBar() {
  const phase = usePhaseStore((s) => s.phase);
  const remainingSec = usePhaseStore((s) => s.remainingSec);
  const running = usePhaseStore((s) => s.running);
  const skip = usePhaseStore((s) => s.skip);
  const extend = usePhaseStore((s) => s.extend);
  const toggleRunning = usePhaseStore((s) => s.toggleRunning);

  // Drive the countdown at 1 Hz. `tick` no-ops while paused, so the interval can
  // run for the component's lifetime. Reading the action via getState() keeps
  // the interval callback out of the effect's setState path (lint-safe, mirrors
  // ReplayScrubber).
  useEffect(() => {
    const id = setInterval(() => usePhaseStore.getState().tick(), 1000);
    return () => clearInterval(id);
  }, []);

  const currentIndex = phaseIndex(phase);
  const atLast = currentIndex === PHASES.length - 1;
  const low = remainingSec <= 30;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
      <ol className="flex items-center gap-1">
        {PHASES.map((p, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "active" : "next";
          const cls =
            state === "active"
              ? "border-sky-500/60 bg-sky-500/15 text-sky-200"
              : state === "done"
                ? "border-neutral-800 bg-neutral-900 text-neutral-500"
                : "border-neutral-800 bg-neutral-900 text-neutral-600";
          return (
            <li
              key={p.phase}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${cls}`}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span className="font-mono text-[10px] opacity-60">{i + 1}</span>
              {p.label}
            </li>
          );
        })}
      </ol>

      <div className="ml-auto flex items-center gap-2">
        <div
          className={`min-w-16 rounded-lg border px-3 py-1 text-center font-mono text-sm ${
            low
              ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
              : "border-neutral-800 bg-neutral-900 text-neutral-100"
          }`}
          aria-label="Time remaining in current phase"
        >
          {formatClock(remainingSec)}
        </div>
        <button
          className={BTN}
          onClick={toggleRunning}
          aria-label={running ? "Pause timer" : "Resume timer"}
        >
          {running ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? "Pause" : "Resume"}
        </button>
        <button
          className={BTN}
          onClick={() => extend(60)}
          aria-label="Extend current phase by one minute"
        >
          <Plus className="h-3.5 w-3.5" /> 1m
        </button>
        <button
          className={BTN}
          onClick={skip}
          disabled={atLast}
          title={atLast ? "Last phase" : "Skip to next phase"}
        >
          <ChevronRight className="h-3.5 w-3.5" /> Skip
        </button>
      </div>
    </div>
  );
}
