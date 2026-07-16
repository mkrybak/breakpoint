"use client";

import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { formatMs, formatPct, formatRps } from "@/components/hud/hud-format";
import { useDesignStore } from "@/stores/design-store";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

const BTN =
  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium";
const BTN_PRIMARY =
  "border-sky-500/60 bg-sky-500/15 text-sky-300 hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_NEUTRAL =
  "border-neutral-700 bg-neutral-900 text-neutral-200 hover:border-neutral-500";

export function MetricsBar() {
  const status = useSimStore((s) => s.status);
  const agg = useSimStore((s) => s.aggregates);
  const runGraph = useSimStore((s) => s.runGraph);
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
          value={live ? formatPct(agg.errorRate) : "—"}
          sub={live ? `peak ${formatPct(agg.peakErrorRate)}` : undefined}
        />
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

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-20 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1">
      <div className="text-[9px] font-medium tracking-wider text-neutral-500 uppercase">
        {label}
      </div>
      <div className="truncate font-mono text-sm text-neutral-100">{value}</div>
      {sub && <div className="font-mono text-[9px] text-neutral-500">{sub}</div>}
    </div>
  );
}
