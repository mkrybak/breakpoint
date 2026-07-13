import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ComponentIcon } from "@/components/icons";
import { getComponentDef } from "@/lib/registry";
import type { ComponentFlowNode } from "@/stores/flow-adapter";

export function ComponentNode({
  data,
  selected,
}: NodeProps<ComponentFlowNode>) {
  const def = getComponentDef(data.kind);
  const utilPct = Math.round(Math.min(Math.max(data.util, 0), 1) * 100);
  return (
    <div
      className={`w-44 rounded-lg border bg-neutral-900 px-3 py-2 shadow-md ${
        selected ? "border-sky-400" : "border-neutral-700"
      }`}
    >
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
            className="h-1 rounded-full"
            style={{ width: `${utilPct}%`, backgroundColor: def.color }}
          />
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
