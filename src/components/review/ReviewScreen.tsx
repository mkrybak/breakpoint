"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import type { Phase } from "@/lib/core";
import { ReplayScrubber } from "@/components/hud/ReplayScrubber";
import { Verdict } from "@/components/hud/Verdict";
import { ActionTimeline } from "@/components/review/ActionTimeline";
import { ReviewCanvas } from "@/components/review/ReviewCanvas";
import { Scorecard } from "@/components/review/Scorecard";
import { buildReviewReport, exportReportFile } from "@/persistence/report";
import { useDesignStore } from "@/stores/design-store";
import { PHASES, formatClock } from "@/stores/phase-store";
import { useScorecardStore } from "@/stores/scorecard-store";
import { useSimStore } from "@/stores/sim-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";

export function ReviewScreen({ runId }: { runId: string }) {
  const designName = useDesignStore((s) => s.designName);
  const graph = useDesignStore((s) => s.graph);
  const actionLog = useDesignStore((s) => s.actionLog);
  const actionSnapshots = useDesignStore((s) => s.actionSnapshots);
  const phaseNotes = useDesignStore((s) => s.phaseNotes);
  const runGraph = useSimStore((s) => s.runGraph);
  const runScenario = useSimStore((s) => s.runScenario);
  const result = useSimStore((s) => s.result);
  const scorecard = useScorecardStore((s) => s.scorecard);

  const [selected, setSelected] = useState<number | null>(null);

  // Load this run's design only if it isn't already the attached in-session design.
  // Re-attaching would wipe the in-memory action snapshots, so skip when the id
  // already matches (the common flow: opening review right after the interview).
  useEffect(() => {
    if (useDesignStore.getState().designId !== runId) {
      useDesignStore.getState().attachDesign(runId);
    }
  }, [runId]);

  const finalView = runGraph ?? graph;
  const viewGraph =
    selected === null ? finalView : (actionSnapshots[selected] ?? finalView);
  const selectedEvent = selected === null ? null : (actionLog[selected] ?? null);

  const onExport = () => {
    const markdown = buildReviewReport({
      designName,
      scenario: runScenario,
      verdict: result?.verdict ?? null,
      phaseNotes,
      actionLog,
      scorecard,
    });
    exportReportFile(designName, markdown);
  };

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <Link
          href={`/design/${runId}`}
          className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to design
        </Link>
        <h1 className="text-sm font-semibold">{designName} — Review</h1>
        <button
          type="button"
          onClick={onExport}
          className="ml-auto flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          <Download className="h-3.5 w-3.5" /> Export report
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 p-3">
          <ActionTimeline
            actionLog={actionLog}
            selectedIndex={selected}
            onSelect={setSelected}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selected !== null && selectedEvent && (
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5">
              <span className="text-xs text-neutral-300">
                Design as of{" "}
                <span className="font-mono text-neutral-100">
                  {formatClock(selectedEvent.t)}
                </span>{" "}
                · after “{selectedEvent.detail}”
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500"
              >
                Back to final design
              </button>
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            <ReviewCanvas graph={viewGraph} />
            {selected === null && (
              <>
                <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
                  <Verdict />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                  <ReplayScrubber />
                </div>
              </>
            )}
          </div>
        </main>

        <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-neutral-800 p-3">
          <PhaseNotesView phaseNotes={phaseNotes} />
          <Scorecard id={runId} />
        </aside>
      </div>
    </div>
  );
}

function PhaseNotesView({
  phaseNotes,
}: {
  phaseNotes: Record<Phase, string>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className={HEADING}>Phase notes</h2>
      {PHASES.map((p) => {
        const note = phaseNotes[p.phase]?.trim();
        return (
          <div key={p.phase}>
            <h3 className={HEADING}>{p.label}</h3>
            {note ? (
              <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-300">
                {phaseNotes[p.phase]}
              </p>
            ) : (
              <p className="mt-1 text-xs text-neutral-600">—</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
