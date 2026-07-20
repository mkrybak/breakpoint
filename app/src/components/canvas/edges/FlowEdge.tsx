"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { edgeDashDuration, edgeWidth } from "@/components/canvas/sim-visuals";
import { useDesignStore } from "@/stores/design-store";
import { useSimStore } from "@/stores/sim-store";
import type { ComponentFlowEdge } from "@/stores/flow-adapter";

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
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const share = data?.trafficShare ?? 1;
  const kind = data?.kind ?? "sync";
  const isLbSource = data?.sourceKind === "lb";
  const isAuto = isLbSource && data?.autoShare !== false;

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
          stroke: selected ? "#38bdf8" : live ? "#737373" : "#525252",
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
          }}
        >
          {selected ? (
            <div className="nodrag nopan pointer-events-auto flex items-center gap-1.5 rounded-lg border border-sky-400 bg-neutral-900 px-2 py-1 shadow-md">
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
                  updateEdge(
                    id,
                    isLbSource
                      ? { autoShare: false, trafficShare }
                      : { trafficShare },
                  );
                }}
                aria-label="Traffic share"
                className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
              />
              {isLbSource && (
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
              {Math.round(share * 100)}%
              {isAuto ? " · auto" : ""}
              {kind === "async" ? " · async" : ""}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
