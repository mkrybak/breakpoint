"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ConfigField, DesignNode } from "@/lib/core";
import { getComponentDef } from "@/lib/registry";
import {
  buildDesignRecord,
  exportDesignFile,
  parseDesignRecord,
} from "@/persistence/local";
import { useDesignStore } from "@/stores/design-store";

const BUTTON =
  "rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-600";
const FIELD_LABEL =
  "text-[10px] font-medium tracking-wider text-neutral-500 uppercase";
const INPUT =
  "mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100";

export function NodeConfigPanel({ designId }: { designId: string }) {
  const attachDesign = useDesignStore((s) => s.attachDesign);
  const importRecord = useDesignStore((s) => s.importRecord);
  const graph = useDesignStore((s) => s.graph);
  const designName = useDesignStore((s) => s.designName);
  const phaseNotes = useDesignStore((s) => s.phaseNotes);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    attachDesign(designId);
  }, [attachDesign, designId]);

  const selected =
    selectedNodeIds.length === 1
      ? graph.nodes.find((n) => n.id === selectedNodeIds[0])
      : undefined;

  const onExport = () =>
    exportDesignFile(
      buildDesignRecord(designId, designName, graph, phaseNotes),
    );

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-importing the same file
    if (!file) return;
    const record = parseDesignRecord(await file.text());
    if (record === null) {
      setImportError("Not a valid design file");
      return;
    }
    setImportError(null);
    importRecord(record);
  };

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Design
      </h2>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onExport} className={BUTTON}>
          Export JSON
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={BUTTON}
        >
          Import JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void onImportFile(event)}
        />
      </div>
      {importError !== null && (
        <p className="mt-2 text-xs text-red-400">{importError}</p>
      )}

      <h2 className="mt-6 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Node
      </h2>
      {selected ? (
        <NodeForm node={selected} />
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          Select a node to configure it.
        </p>
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
