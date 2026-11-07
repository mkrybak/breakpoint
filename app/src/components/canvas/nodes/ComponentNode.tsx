"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ComponentIcon } from "@/components/icons";
import { STATE_COLOR, formatCount } from "@/components/canvas/sim-visuals";
import { formatLag } from "@/components/hud/hud-format";
import { getComponentDef } from "@/lib/registry";
import { useSimStore } from "@/stores/sim-store";
import type { ComponentFlowNode } from "@/stores/flow-adapter";

export function ComponentNode({ id, data, selected }: NodeProps<ComponentFlowNode>) {
  const def = getComponentDef(data.kind);
  const live = useSimStore((s) => s.latestFrame?.perNode[id]);

  const state = live?.state ?? "ok";
  const isDown = state === "down";
  const isOverloaded = state === "overloaded";
  const utilPct = Math.round(Math.min(Math.max(live?.util ?? 0, 0), 1) * 100);
  const barColor = live ? STATE_COLOR[state] : def.color;
  // async nodes report backlog in messages; others carry it in RPS units
  const backlog = live?.queueDepth ?? (live ? live.queued : 0);
  const isAsync = def.category === "async";
  // a buffering queue is doing its job — amber, not an error, until overloaded
  const badgeClass =
    isAsync && !isOverloaded
      ? "bg-amber-500 text-neutral-950"
      : "bg-red-500 text-white";

  const borderClass = selected
    ? "border-sky-400"
    : isDown
      ? "border-dashed border-neutral-600"
      : isOverloaded
        ? "border-red-500"
        : "border-neutral-700";

  return (
    <div
      className={`relative w-44 rounded-lg border bg-neutral-900 px-3 py-2 shadow-md ${borderClass} ${
        isDown ? "opacity-50" : ""
      }`}
      style={
        isOverloaded
          ? { animation: "sim-pulse 1s ease-in-out infinite" }
          : undefined
      }
    >
      {live && Math.round(backlog) > 0 && (
        <span
          className={`absolute -top-2 -right-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold shadow ${badgeClass}`}
          title={
            isAsync
              ? `${formatCount(Math.round(backlog))} messages waiting · lag ${formatLag(live.lagSec ?? 0)}`
              : undefined
          }
        >
          {formatCount(Math.round(backlog))}
        </span>
      )}
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${def.color}33`, color: def.color }}
        >
          <ComponentIcon name={def.icon} className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-medium text-neutral-100">
          {data.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-neutral-400 uppercase">
          {def.kind}
        </span>
        <div className="h-1 flex-1 rounded-full bg-neutral-800">
          <div
            className="h-1 rounded-full transition-all duration-100"
            style={{ width: `${utilPct}%`, backgroundColor: barColor }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
