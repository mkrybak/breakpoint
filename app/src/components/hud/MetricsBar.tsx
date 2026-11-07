"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  ERRORS_HINT,
  formatLag,
  formatMs,
  formatPct,
  formatRps,
  formatSec,
  hasAsyncNodes,
  LAG_HINT,
  P95_HINT,
  P95_MODEL_NOTE,
  QUEUE_LAG_HINT,
  topP95Contributors,
} from "@/components/hud/hud-format";
import type { DesignGraph, SimFrame } from "@/lib/core";
import {
  dismissP95ModelNote,
  p95ModelNoteDue,
} from "@/persistence/notices";
import { useDesignStore } from "@/stores/design-store";
import { useScenarioStore } from "@/stores/scenario-store";
import {
  displayAggregates,
  selectDisplayFrame,
  useSimStore,
} from "@/stores/sim-store";

const BTN =
  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium";
const BTN_PRIMARY =
  "border-sky-500/60 bg-sky-500/15 text-sky-300 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_NEUTRAL =
  "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500";

export type HudVariant = "full" | "simple";

/** Shared run state + controls for both HUD variants. */
function useRunControls() {
  const status = useSimStore((s) => s.status);
  const runAgg = useSimStore((s) => s.aggregates);
  const frame = useSimStore(selectDisplayFrame);
  const runGraph = useSimStore((s) => s.runGraph);
  // scrubbed frame during replay, newest while running; peaks stay whole-run
  const agg = displayAggregates(
    runAgg,
    frame,
    runGraph?.nodes.map((n) => n.id) ?? [],
  );
  // runGraph is null when idle, so the idle HUD follows the live design
  const hasAsync = useDesignStore((s) => hasAsyncNodes(runGraph ?? s.graph));
  const run = useSimStore((s) => s.run);
  const pause = useSimStore((s) => s.pause);
  const resume = useSimStore((s) => s.resume);
  const stop = useSimStore((s) => s.stop);
  const hasEntry = useDesignStore((s) => s.graph.entryNodeId !== "");

  const startRun = () => {
    const { graph } = useDesignStore.getState();
    const { scenario } = useScenarioStore.getState();
    run(graph, scenario);
  };

  return {
    status,
    agg,
    runGraph,
    /** the frame the canvas shows (live, or the scrubbed replay frame) */
    frame,
    hasAsync,
    startRun,
    pause,
    resume,
    stop,
    hasEntry,
  };
}

type RunControls = ReturnType<typeof useRunControls>;

export function MetricsBar({
  variant = "full",
  controls,
}: {
  variant?: HudVariant;
  /** simple only: extra controls after Run (Quick's menus) */
  controls?: ReactNode;
} = {}) {
  const rc = useRunControls();
  if (variant === "simple") return <SimpleBar controls={controls} {...rc} />;
  const {
    status,
    agg,
    runGraph,
    frame,
    hasAsync,
    startRun,
    pause,
    resume,
    stop,
    hasEntry,
  } = rc;

  const live = status !== "idle";
  const bottleneck =
    agg.bottleneckNodeId != null
      ? (runGraph?.nodes.find((n) => n.id === agg.bottleneckNodeId)?.label ??
        agg.bottleneckNodeId)
      : null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3 py-2">
      <div className="flex items-center gap-2">
        {status === "running" ? (
          <button className={`${BTN} ${BTN_NEUTRAL}`} onClick={pause}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        ) : status === "paused" ? (
          <button className={`${BTN} ${BTN_NEUTRAL}`} onClick={resume}>
            <Play className="h-3.5 w-3.5" /> Resume
          </button>
        ) : (
          <button
            className={`${BTN} ${BTN_PRIMARY}`}
            onClick={startRun}
            disabled={!hasEntry}
            title={hasEntry ? undefined : "Add a client entry node to run"}
          >
            {status === "done" ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {status === "done" ? "Re-run" : "Run"}
          </button>
        )}
        {(status === "running" || status === "paused") && (
          <button className={`${BTN} ${BTN_NEUTRAL}`} onClick={stop}>
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <P95Metric
          value={live ? formatMs(agg.p95Ms) : "—"}
          sub={live ? `peak ${formatMs(agg.peakP95Ms)}` : undefined}
          live={live}
          frame={frame}
          graph={runGraph}
        />
        <Metric
          label="Errors"
          hint={ERRORS_HINT}
          value={live ? formatPct(agg.errorRate) : "—"}
          sub={live ? `peak ${formatPct(agg.peakErrorRate)}` : undefined}
        />
        {hasAsync && (
          <Metric
            label="Lag"
            hint={LAG_HINT}
            value={live ? formatLag(agg.maxLagSec) : "—"}
            sub={
              live
                ? `peak ${formatLag(agg.peakLagSec)}${agg.asyncLost >= 1 ? ` · ${formatRps(agg.asyncLost)} lost` : ""}`
                : undefined
            }
          />
        )}
        <Metric
          label="Served"
          value={live ? `${formatRps(agg.servedRps)} rps` : "—"}
        />
        <Metric
          label="Bottleneck"
          value={bottleneck ?? "—"}
          sub={
            live && agg.bottleneckNodeId ? formatPct(agg.bottleneckUtil) : undefined
          }
        />
      </div>
    </div>
  );
}

const RUN_LG =
  "flex h-10 items-center gap-2 rounded-lg bg-sky-500 px-5 text-sm font-semibold text-neutral-950 shadow-lg shadow-sky-500/20 transition-colors duration-150 hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-40";
const NEUTRAL_LG =
  "flex h-10 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300";

/** Quick mode's HUD: a dominant Run button, optional menus, and three numbers (four with a queue). */
function SimpleBar({
  controls,
  status,
  agg,
  runGraph,
  frame,
  hasAsync,
  startRun,
  pause,
  resume,
  stop,
  hasEntry,
}: RunControls & { controls?: ReactNode }) {
  const live = status !== "idle";

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 bg-neutral-950 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {status === "running" ? (
          <button className={NEUTRAL_LG} onClick={pause}>
            <Pause className="h-4 w-4" /> Pause
          </button>
        ) : status === "paused" ? (
          <button className={NEUTRAL_LG} onClick={resume}>
            <Play className="h-4 w-4" /> Resume
          </button>
        ) : (
          <button
            className={RUN_LG}
            onClick={startRun}
            disabled={!hasEntry}
            title={hasEntry ? undefined : "Add a client entry node to run"}
          >
            {status === "done" ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {status === "done" ? "Re-run" : "Run"}
          </button>
        )}
        {(status === "running" || status === "paused") && (
          <button className={NEUTRAL_LG} onClick={stop}>
            <Square className="h-4 w-4" /> Stop
          </button>
        )}
      </div>

      {controls && (
        <div className="flex items-center gap-2 border-l border-neutral-800 pl-3">
          {controls}
        </div>
      )}

      {/* a fourth card only fits the Quick canvas column with tighter cards */}
      <div
        className={`ml-auto flex items-center ${hasAsync ? "gap-1.5" : "gap-2"}`}
      >
        <Metric
          label="Served"
          compact={hasAsync}
          value={live ? `${formatRps(agg.servedRps)} rps` : "—"}
        />
        <P95Metric
          compact={hasAsync}
          value={live ? formatMs(agg.p95Ms) : "—"}
          live={live}
          frame={frame}
          graph={runGraph}
        />
        <Metric
          label="Errors"
          hint={ERRORS_HINT}
          compact={hasAsync}
          value={live ? formatPct(agg.errorRate) : "—"}
        />
        {hasAsync && (
          <Metric
            label="Queue lag"
            compact
            hint={QUEUE_LAG_HINT}
            value={live ? formatLag(agg.maxLagSec) : "—"}
          />
        )}
      </div>
    </div>
  );
}

/** p95's popover body: the frame's biggest contributors (engine p95ByNode). */
function P95Breakdown({
  frame,
  graph,
}: {
  frame: SimFrame;
  graph: DesignGraph;
}) {
  const top = topP95Contributors(frame, graph);
  if (top.length === 0) return null;
  return (
    <div className="mt-3 border-t border-neutral-800 pt-2">
      <p className="text-[10px] font-semibold tracking-wider text-neutral-500 uppercase">
        Biggest share at{" "}
        <span className="normal-case">{formatSec(frame.t)}</span>
      </p>
      <ol className="mt-1.5 space-y-1">
        {top.map((c) => (
          <li key={c.id} className="flex items-baseline gap-2 text-xs">
            <span className="min-w-0 truncate text-neutral-200">{c.label}</span>
            <span className="ml-auto shrink-0 font-mono text-neutral-400">
              {formatMs(c.ms)} · {Math.round(c.share * 100)}%
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One-time "new p95 model" note for users with designs saved before T-8.7. */
function useP95ModelNote() {
  const [due, setDue] = useState(false);
  useEffect(() => {
    // localStorage is read after mount, not during render (no hydration
    // mismatch), and once: a later autosave can't change eligibility.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDue(p95ModelNoteDue());
  }, []);
  const dismiss = () => {
    dismissP95ModelNote();
    setDue(false);
  };
  return { due, dismiss };
}

function P95ModelNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="absolute top-full right-0 z-30 mt-2 w-64 rounded-xl border border-sky-500/40 bg-neutral-900 p-3 text-left shadow-xl shadow-black/40"
    >
      <p className="text-xs font-semibold text-sky-300">New p95 model</p>
      <p className="mt-1 text-xs leading-snug text-neutral-300">
        {P95_MODEL_NOTE}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 h-8 rounded-md border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition-colors duration-150 hover:border-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
      >
        Got it
      </button>
    </div>
  );
}

function P95Metric({
  value,
  sub,
  compact,
  live,
  frame,
  graph,
}: {
  value: string;
  sub?: string;
  compact?: boolean;
  live: boolean;
  frame: SimFrame | null;
  graph: DesignGraph | null;
}) {
  const note = useP95ModelNote();
  const showNote = live && note.due;
  return (
    <Metric
      label="p95"
      hint={P95_HINT}
      value={value}
      sub={sub}
      compact={compact}
      detail={
        frame && graph ? <P95Breakdown frame={frame} graph={graph} /> : undefined
      }
      onOpen={showNote ? note.dismiss : undefined}
      callout={showNote ? <P95ModelNote onDismiss={note.dismiss} /> : undefined}
    />
  );
}

function Metric({
  label,
  value,
  sub,
  hint,
  detail,
  callout,
  onOpen,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string;
  /** explains how the number is derived: dotted label; click/tap opens a popover */
  hint?: string;
  /** extra popover content under the hint */
  detail?: ReactNode;
  /** rendered under the card while the popover is closed */
  callout?: ReactNode;
  /** called when the popover opens */
  onOpen?: () => void;
  /** tighter card (Quick bar with four metrics) */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const card = `rounded-lg border border-neutral-800 bg-neutral-900 py-1 ${
    compact ? "min-w-16 px-2" : "min-w-20 px-3"
  }`;
  const body = (
    <>
      <div
        className={`text-[9px] font-medium tracking-wider whitespace-nowrap text-neutral-500 uppercase${
          hint
            ? " underline decoration-neutral-500 decoration-dotted underline-offset-2"
            : ""
        }`}
      >
        {label}
      </div>
      <div className="truncate font-mono text-sm text-neutral-100">{value}</div>
      {sub && <div className="font-mono text-[9px] text-neutral-500">{sub}</div>}
    </>
  );

  if (!hint) return <div className={card}>{body}</div>;

  const toggle = () => {
    if (!open) onOpen?.();
    setOpen(!open);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={toggle}
        className={`${card} block cursor-help text-left transition-colors duration-150 hover:border-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 aria-expanded:border-neutral-500`}
      >
        {body}
      </button>
      {open ? (
        <div
          id={popId}
          role="dialog"
          aria-label={`About ${label}`}
          className="absolute top-full right-0 z-30 mt-2 w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-left shadow-xl shadow-black/40"
        >
          <p className="text-xs leading-snug text-neutral-300">{hint}</p>
          {detail}
        </div>
      ) : (
        callout
      )}
    </div>
  );
}
