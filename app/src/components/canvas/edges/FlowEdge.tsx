"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { edgeDashDuration, edgeWidth } from "@/components/canvas/sim-visuals";
import { getComponentDef, isSplitSource } from "@/lib/registry";
import { useDesignStore } from "@/stores/design-store";
import { useSimStore } from "@/stores/sim-store";
import type { ComponentFlowEdge } from "@/stores/flow-adapter";

/** Upper bound on the call-edge editor (T-8.3); the engine itself is unbounded. */
const MAX_CALLS_PER_REQUEST = 100;

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  data,
}: EdgeProps<ComponentFlowEdge>) {
  const updateEdge = useDesignStore((s) => s.updateEdge);
  const rps = useSimStore((s) => s.latestFrame?.perEdge[id]?.rps ?? 0);
  // T-8.6: same source as rps, so replay scrubbing shows the phase too
  const breakerPhase = useSimStore((s) => s.latestFrame?.perEdge[id]?.breaker);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const isSplit = isSplitSource(data?.sourceKind);
  const share = data?.trafficShare ?? 1;
  const calls = data?.callsPerRequest ?? 1;
  const kind = data?.kind ?? "sync";
  const isAuto = isSplit && data?.autoShare !== false;
  // breakers apply to sync calls whose source isn't a queue/stream (edgeSupportsResilience)
  const hasBreaker =
    kind === "sync" &&
    data?.breaker !== undefined &&
    data.sourceKind !== undefined &&
    getComponentDef(data.sourceKind).category !== "async";

  const live = rps > 0;
  const width = live ? edgeWidth(rps) : selected ? 2 : 1.5;
  // Quantize the animation period so it changes rarely (avoids restart jitter tick-to-tick).
  const dur = Math.round(edgeDashDuration(rps) * 10) / 10;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected
            ? "#38bdf8"
            : breakerPhase === "open"
              ? "#fb7185"
              : live
                ? "#737373"
                : "#525252",
          strokeWidth: width,
          strokeDasharray: live ? "8 6" : kind === "async" ? "6 3" : undefined,
          animation: live ? `sim-flow ${dur}s linear infinite` : undefined,
          transition: "stroke-width 120ms linear",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="absolute"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            // the open editor sits above nodes (React Flow paints nodes after
            // labels), so a short edge's popover isn't hidden under its ends
            zIndex: selected ? 1001 : undefined,
          }}
        >
          {selected ? (
            <div className="nodrag nopan pointer-events-auto flex items-center gap-1.5 rounded-lg border border-sky-400 bg-neutral-900 px-2 py-1 shadow-md">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                {isSplit ? "Share" : "Calls/req"}
              </span>
              {isSplit ? (
                <>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={share}
                    onChange={(event) => {
                      const next = event.target.valueAsNumber;
                      if (Number.isNaN(next)) return;
                      const trafficShare = Math.min(Math.max(next, 0), 1);
                      updateEdge(id, { autoShare: false, trafficShare });
                    }}
                    aria-label="Traffic share"
                    className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={isAuto}
                      onChange={(event) =>
                        updateEdge(
                          id,
                          event.target.checked
                            ? { autoShare: true }
                            : { autoShare: false, trafficShare: share },
                        )
                      }
                      aria-label="Auto share"
                      className="accent-sky-500"
                    />
                    auto
                  </label>
                </>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={MAX_CALLS_PER_REQUEST}
                  step={0.1}
                  value={calls}
                  onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isNaN(next)) return;
                    const callsPerRequest = Math.min(
                      Math.max(next, 0),
                      MAX_CALLS_PER_REQUEST,
                    );
                    updateEdge(id, { callsPerRequest });
                  }}
                  aria-label="Calls per request"
                  className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
                />
              )}
              <select
                value={kind}
                onChange={(event) =>
                  updateEdge(id, {
                    kind: event.target.value as "sync" | "async",
                  })
                }
                aria-label="Edge kind"
                className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
              >
                <option value="sync">sync</option>
                <option value="async">async</option>
              </select>
            </div>
          ) : (
            <span className="rounded bg-neutral-900/90 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              {isSplit
                ? `${Math.round(share * 100)}%`
                : `×${Math.round(calls * 100) / 100}`}
              {isAuto ? " · auto" : ""}
              {kind === "async" ? " · async" : ""}
              {hasBreaker && (
                <span
                  className={
                    breakerPhase === "open"
                      ? "text-rose-400"
                      : breakerPhase === "half-open"
                        ? "text-amber-400"
                        : undefined
                  }
                >
                  {breakerPhase === "open"
                    ? " · breaker open"
                    : breakerPhase === "half-open"
                      ? " · breaker probing"
                      : " · breaker"}
                </span>
              )}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
