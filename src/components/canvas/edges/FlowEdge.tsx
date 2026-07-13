"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useDesignStore } from "@/stores/design-store";
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#38bdf8" : "#525252",
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: kind === "async" ? "6 3" : undefined,
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
                  updateEdge(id, {
                    trafficShare: Math.min(Math.max(next, 0), 1),
                  });
                }}
                aria-label="Traffic share"
                className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
              />
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
              {kind === "async" ? " · async" : ""}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
