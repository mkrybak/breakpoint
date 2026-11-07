"use client";

import type { ReactNode } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import {
  formatLag,
  formatMs,
  formatPct,
  formatRps,
  hasAsyncNodes,
} from "@/components/hud/hud-format";
import { useDesignStore } from "@/stores/design-store";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

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
  const agg = useSimStore((s) => s.aggregates);
  const runGraph = useSimStore((s) => s.runGraph);
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
        <Metric
          label="p95"
          value={live ? formatMs(agg.p95Ms) : "—"}
          sub={live ? `peak ${formatMs(agg.peakP95Ms)}` : undefined}
        />
        <Metric
          label="Errors"
          title="Requests the client saw fail. Work dropped after it was queued is not counted here."
          value={live ? formatPct(agg.errorRate) : "—"}
          sub={live ? `peak ${formatPct(agg.peakErrorRate)}` : undefined}
        />
        {hasAsync && (
          <Metric
            label="Lag"
            title="Max consumer lag: how far behind (seconds) the slowest queue's consumers are. Not part of the error rate."
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
        <Metric
          label="p95"
          compact={hasAsync}
          value={live ? formatMs(agg.p95Ms) : "—"}
        />
        <Metric
          label="Errors"
          compact={hasAsync}
          value={live ? formatPct(agg.errorRate) : "—"}
        />
        {hasAsync && (
          <Metric
            label="Queue lag"
            compact
            title="How far behind the queue's workers are, in seconds."
            value={live ? formatLag(agg.maxLagSec) : "—"}
          />
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  title,
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string;
  title?: string;
  /** tighter card (Quick bar with four metrics) */
  compact?: boolean;
}) {
  return (
    <div
      title={title}
      className={`rounded-lg border border-neutral-800 bg-neutral-900 py-1 ${
        compact ? "min-w-16 px-2" : "min-w-20 px-3"
      }`}
    >
      <div className="text-[9px] font-medium tracking-wider whitespace-nowrap text-neutral-500 uppercase">
        {label}
      </div>
      <div className="truncate font-mono text-sm text-neutral-100">{value}</div>
      {sub && <div className="font-mono text-[9px] text-neutral-500">{sub}</div>}
    </div>
  );
}
