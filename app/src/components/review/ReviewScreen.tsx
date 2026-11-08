"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Package } from "lucide-react";
import type { DesignBoards, Phase } from "@/lib/core";
import { ApiBoard } from "@/components/boards/api/ApiBoard";
import { EntitiesBoard } from "@/components/boards/entities/EntitiesBoard";
import { RequirementsBoard } from "@/components/boards/RequirementsBoard";
import { ReplayScrubber } from "@/components/hud/ReplayScrubber";
import { Verdict } from "@/components/hud/Verdict";
import { ActionTimeline } from "@/components/review/ActionTimeline";
import {
  boardCounts,
  hasBoardContent,
  type BoardKey,
} from "@/components/review/board-counts";
import { ImportDropzone } from "@/components/review/ImportDropzone";
import { ReviewCanvas } from "@/components/review/ReviewCanvas";
import { Scorecard } from "@/components/review/Scorecard";
import {
  buildDesignRecord,
  buildRunBundle,
  exportRunBundleFile,
} from "@/persistence/local";
import { buildReviewReport, exportReportFile } from "@/persistence/report";
import { useDesignStore } from "@/stores/design-store";
import { PHASES, formatClock, phaseConfig } from "@/stores/phase-store";
import { useScorecardStore } from "@/stores/scorecard-store";
import { useSimStore } from "@/stores/sim-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";

const BTN =
  "flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500";

type ReviewView = "design" | BoardKey;
const REVIEW_VIEWS: readonly { view: ReviewView; label: string }[] = [
  { view: "design", label: "Design" },
  { view: "requirements", label: phaseConfig("requirements").label },
  { view: "entities", label: phaseConfig("entities").label },
  { view: "api", label: phaseConfig("api").label },
];
const EMPTY_BOARD: Record<BoardKey, string> = {
  requirements: "No requirements were written.",
  entities: "No entities were modeled.",
  api: "No endpoints were written.",
};
const TAB =
  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300";

export function ReviewScreen({ runId }: { runId: string }) {
  const designName = useDesignStore((s) => s.designName);
  const designMode = useDesignStore((s) => s.designMode);
  const graph = useDesignStore((s) => s.graph);
  const actionLog = useDesignStore((s) => s.actionLog);
  const actionSnapshots = useDesignStore((s) => s.actionSnapshots);
  const phaseNotes = useDesignStore((s) => s.phaseNotes);
  const boards = useDesignStore((s) => s.boards);
  const runGraph = useSimStore((s) => s.runGraph);
  const runScenario = useSimStore((s) => s.runScenario);
  const result = useSimStore((s) => s.result);
  const scorecard = useScorecardStore((s) => s.scorecard);

  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<ReviewView>("design");
  const counts = boardCounts(boards);

  // Load this run's design only if it isn't already the attached in-session design.
  // Re-attaching would wipe the in-memory action snapshots, so skip when the id
  // already matches (the common flow: opening review right after the interview).
  useEffect(() => {
    if (useDesignStore.getState().designId !== runId) {
      useDesignStore.getState().attachDesign(runId);
    }
  }, [runId]);

  const nothingToReview =
    result === null &&
    graph.nodes.length === 0 &&
    actionLog.length === 0 &&
    !hasBoardContent(counts);

  const onExportBundle = () => {
    if (!result || !runScenario) return;
    const design = buildDesignRecord(
      runId,
      designName,
      graph,
      designMode,
      phaseNotes,
      actionLog,
      boards,
    );
    exportRunBundleFile(buildRunBundle(design, runScenario, result, scorecard));
  };

  if (nothingToReview) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-neutral-950 p-6 text-neutral-100">
        <div className="text-center">
          <h1 className="text-lg font-semibold">Review a run</h1>
          <p className="mt-1 max-w-md text-sm text-neutral-400">
            Import a run bundle (<code>.breakmydesign.json</code>) exported from an
            interview to replay and grade it.
          </p>
        </div>
        <ImportDropzone />
        <Link
          href="/"
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← Back to designs
        </Link>
      </div>
    );
  }

  const finalView = runGraph ?? graph;
  const viewGraph =
    selected === null ? finalView : (actionSnapshots[selected] ?? finalView);
  const selectedEvent =
    selected === null ? null : (actionLog[selected] ?? null);

  const onExport = () => {
    const markdown = buildReviewReport({
      designName,
      scenario: runScenario,
      verdict: result?.verdict ?? null,
      phaseNotes,
      boards,
      actionLog,
      scorecard,
    });
    exportReportFile(designName, markdown);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <Link
          href={`/design/${runId}`}
          className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to design
        </Link>
        <h1 className="text-sm font-semibold">{designName} — Review</h1>
        <div className="ml-auto flex items-center gap-2">
          {result && runScenario && (
            <button type="button" onClick={onExportBundle} className={BTN}>
              <Package className="h-3.5 w-3.5" /> Export bundle
            </button>
          )}
          <button type="button" onClick={onExport} className={BTN}>
            <Download className="h-3.5 w-3.5" /> Export report
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 p-3">
          <ActionTimeline
            actionLog={actionLog}
            selectedIndex={selected}
            onSelect={(index) => {
              setSelected(index);
              setView("design");
            }}
          />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div
            role="tablist"
            aria-label="Review views"
            className="flex shrink-0 items-center gap-1 border-b border-neutral-800 px-3 py-1.5"
          >
            {REVIEW_VIEWS.map(({ view: v, label }) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`${TAB} ${view === v ? "border-sky-500/60 bg-sky-500/15 text-sky-200" : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"}`}
              >
                {label}
                {v !== "design" && (
                  <span className="font-mono text-[10px] opacity-60">
                    {counts[v]}
                  </span>
                )}
              </button>
            ))}
          </div>
          {view === "design" ? (
            <div
              role="tabpanel"
              aria-label="Design"
              className="flex min-h-0 flex-1 flex-col"
            >
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
            </div>
          ) : (
            <div
              role="tabpanel"
              aria-label={phaseConfig(view).label}
              className={
                view === "entities"
                  ? "relative min-h-0 flex-1"
                  : "min-h-0 flex-1 overflow-y-auto"
              }
            >
              <ReadOnlyBoard
                view={view}
                boards={boards}
                empty={counts[view] === 0}
              />
            </div>
          )}
        </main>

        <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-neutral-800 p-3">
          <PhaseNotesView phaseNotes={phaseNotes} />
          <Scorecard id={runId} />
        </aside>
      </div>
    </div>
  );
}

function ReadOnlyBoard({
  view,
  boards,
  empty,
}: {
  view: BoardKey;
  boards: DesignBoards;
  empty: boolean;
}) {
  if (empty)
    return <p className="p-6 text-sm text-neutral-500">{EMPTY_BOARD[view]}</p>;
  if (view === "requirements") {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <RequirementsBoard readOnly board={boards.requirements} />
      </div>
    );
  }
  if (view === "entities") {
    return (
      <div className="absolute inset-0">
        <EntitiesBoard readOnly board={boards.entities} />
      </div>
    );
  }
  return <ApiBoard readOnly board={boards.api} />; // ApiBoard's read-only root carries its own max-w-4xl p-6
}

function PhaseNotesView({ phaseNotes }: { phaseNotes: Record<Phase, string> }) {
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
