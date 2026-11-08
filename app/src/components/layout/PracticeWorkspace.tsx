"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { useSeedNonFunctional } from "@/components/boards/RequirementsBoard";
import { StepAside, StepBoard } from "@/components/boards/StepBoard";
import { DesignCanvas } from "@/components/canvas/DesignCanvas";
import { EventLog } from "@/components/hud/EventLog";
import { MetricsBar } from "@/components/hud/MetricsBar";
import { ReplayScrubber } from "@/components/hud/ReplayScrubber";
import { Verdict } from "@/components/hud/Verdict";
import { Palette } from "@/components/palette/Palette";
import { DesignFileMenu } from "@/components/panels/DesignFileMenu";
import { NodeConfigPanel } from "@/components/panels/NodeConfigPanel";
import { PhaseBar } from "@/components/panels/PhaseBar";
import { PhaseNotes } from "@/components/panels/PhaseNotes";
import { RequirementsPanel } from "@/components/panels/RequirementsPanel";
import { ScenarioPanel } from "@/components/panels/ScenarioPanel";
import { SmallScreenNotice } from "@/components/layout/SmallScreenNotice";
import { hasStepBoard, usePhaseStore } from "@/stores/phase-store";

/**
 * The Practice-mode workspace: phase bar, full HUD, scenario/requirements/notes
 * column. The center shows the viewed step's board (before HLD) or the canvas (T-13.2).
 */
export function PracticeWorkspace({
  designId,
  notice,
}: {
  designId: string;
  /** one-line banner above the phase bar (interview fallback) */
  notice?: ReactNode;
}) {
  useSeedNonFunctional(designId);
  const viewedPhase = usePhaseStore((s) => s.viewedPhase);
  const board = hasStepBoard(viewedPhase) ? viewedPhase : null;
  return (
    <div className="flex h-dvh flex-col">
      <SmallScreenNotice />
      {notice}
      <div className="flex min-h-0 flex-1 flex-col">
        <PhaseBar />
        <div className="flex min-h-0 flex-1">
          {board === null && <Palette />}
          <main className="flex min-w-0 flex-1 flex-col">
            <MetricsBar menu={<DesignFileMenu />} />
            <div className="flex min-h-0 flex-1">
              {/* Verdict and scrubber keep their tree position in both modes (scrubber state survives a swap); only the wrappers change. */}
              <div
                className={
                  board
                    ? "flex min-w-0 flex-1 flex-col bg-neutral-950"
                    : "relative min-w-0 flex-1"
                }
              >
                <div
                  className={
                    board
                      ? "flex justify-center px-3 pt-3 empty:hidden"
                      : "pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center"
                  }
                >
                  <Verdict />
                </div>
                <div className={board ? "min-h-0 flex-1" : "h-full"}>
                  {board ? (
                    <StepBoard key={board} phase={board} />
                  ) : (
                    <DesignCanvas designId={designId} />
                  )}
                </div>
                <div
                  className={
                    board
                      ? "flex justify-center px-3 pb-3 empty:hidden"
                      : "pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center"
                  }
                >
                  <ReplayScrubber />
                </div>
              </div>
              {board === null && <NodeConfigPanel />}
            </div>
          </main>
          <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
            <div className="flex flex-col gap-6 overflow-y-auto p-3">
              <Link
                href={`/review/${designId}`}
                className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
              >
                Open review screen →
              </Link>
              <ScenarioPanel />
              <RequirementsPanel />
              <StepAside phase={viewedPhase} />
              <PhaseNotes />
            </div>
            <EventLog />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** mode "interview" before M11: Practice layout + notice (product-modes spec). */
export function InterviewPreviewWorkspace({ designId }: { designId: string }) {
  return (
    <PracticeWorkspace designId={designId} notice={<InterviewModeNotice />} />
  );
}

function InterviewModeNotice() {
  return (
    <div
      role="note"
      className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-300"
    >
      <Info className="h-4 w-4 shrink-0 text-sky-400" />
      <span>
        Live interview mode is coming soon, so this design opens in Practice
        mode.
      </span>
    </div>
  );
}
