"use client";

import { X } from "lucide-react";
import type { ConfigField, DesignNode } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import { useDesignStore } from "@/stores/design-store";
import { EdgeInspector } from "./EdgeInspector";
import { FIELD_LABEL, INPUT } from "./styles";

/** Selection inspector (T-12.8): renders only while one node or one edge is selected. */
export function NodeConfigPanel() {
  const graph = useDesignStore((s) => s.graph);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDesignStore((s) => s.selectedEdgeIds);
  const clearSelection = useDesignStore((s) => s.clearSelection);

  const selected =
    selectedNodeIds.length === 1
      ? graph.nodes.find((n) => n.id === selectedNodeIds[0])
      : undefined;
  const selectedEdge =
    selectedNodeIds.length === 0 && selectedEdgeIds.length === 1
      ? graph.edges.find((e) => e.id === selectedEdgeIds[0])
      : undefined;

  if (!selected && !selectedEdge) return null;

  return (
    <aside
      aria-label={selected ? "Node settings" : "Edge settings"}
      className="w-64 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
          {selected ? "Node" : "Edge"}
        </h2>
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Close inspector"
          title="Close (deselects)"
          className="-my-1.5 -mr-1.5 flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-sky-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {selected ? (
        <NodeForm node={selected} />
      ) : (
        selectedEdge && <EdgeInspector edge={selectedEdge} />
      )}
    </aside>
  );
}

function NodeForm({ node }: { node: DesignNode }) {
  const renameNode = useDesignStore((s) => s.renameNode);
  const updateNodeConfig = useDesignStore((s) => s.updateNodeConfig);
  const def = getComponentDef(node.kind);

  return (
    <div className="mt-2 space-y-3">
      <label className="block">
        <span className={FIELD_LABEL}>Label</span>
        <input
          type="text"
          value={node.label}
          onChange={(event) => renameNode(node.id, event.target.value)}
          className={INPUT}
        />
      </label>
      {def.configFields.map((field) => (
        <ConfigFieldInput
          key={field.key}
          field={field}
          value={node.config[field.key]}
          onChange={(value) => updateNodeConfig(node.id, field.key, value)}
        />
      ))}
      {def.configFields.length === 0 && (
        <p className="text-xs text-neutral-500">
          No configuration for this component.
        </p>
      )}
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: number | string | boolean | undefined;
  onChange: (value: number | string | boolean) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="text-xs text-neutral-300">{field.label}</span>
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className={FIELD_LABEL}>{field.label}</span>
        <select
          value={typeof value === "string" ? value : field.default}
          onChange={(event) => onChange(event.target.value)}
          className={INPUT}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step}
        value={typeof value === "number" ? value : field.default}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isNaN(next)) return;
          onChange(Math.min(Math.max(next, field.min), field.max));
        }}
        className={INPUT}
      />
    </label>
  );
}
