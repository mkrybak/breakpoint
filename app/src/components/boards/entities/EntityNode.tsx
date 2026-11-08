"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { EntityBox, EntityField } from "@/lib/core";
import { useDesignStore } from "@/stores/design-store";
import {
  entityNameKey,
  fieldNameKey,
  fieldTypeKey,
  useEntityBoardUi,
  useFocusTarget,
} from "./board-ui";
import { dropIndex, type EntityFlowNode } from "./entity-flow";

const HANDLE_STYLE = { width: 8, height: 8, background: "#262626", borderColor: "#737373" } as const;
const FIELD_DND_TYPE = "application/x-bp-entity-field";
const INPUT_CLASS =
  "nodrag min-w-0 cursor-text rounded bg-transparent px-1 py-0.5 font-mono text-xs outline-hidden placeholder:text-neutral-600 focus:bg-neutral-800 focus:ring-2 focus:ring-sky-500/40";

/** An entity box: a read-only card on review, an editor reading design-store directly otherwise. */
export function EntityNode({ id, data, selected }: NodeProps<EntityFlowNode>) {
  return useEntityBoardUi().readOnly ? (
    <EntityCard entity={data.entity} />
  ) : (
    <EntityEditor id={id} selected={selected} />
  );
}

function EntityCard({ entity }: { entity: EntityBox }) {
  const fields = entity.fields.filter((f) => f.name.trim() || f.type.trim());
  return (
    <div className="w-56 rounded-lg border border-neutral-700 bg-neutral-900 shadow-md">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ ...HANDLE_STYLE, opacity: 0 }}
      />
      <p className="truncate border-b border-neutral-800 px-3 py-1.5 text-sm font-semibold text-neutral-100">
        {entity.name.trim() ? entity.name : <span className="text-neutral-500 italic">(unnamed)</span>}
      </p>
      {fields.length > 0 ? (
        <ul className="py-1">
          {fields.map((f) => (
            <li key={f.id} className="flex gap-2 px-3 py-0.5 font-mono text-xs">
              <span className="min-w-0 flex-1 truncate text-neutral-200">{f.name}</span>
              <span className="text-sky-300/80">{f.type}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-1 text-xs text-neutral-500 italic">No fields</p>
      )}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ ...HANDLE_STYLE, opacity: 0 }}
      />
    </div>
  );
}

/**
 * Reads its entity from design-store, not node data: React Flow syncs
 * controlled nodes in an effect, so an input fed by node data would lag a
 * render behind and lose its caret on every keystroke.
 */
function EntityEditor({ id, selected }: { id: string; selected: boolean }) {
  const entity = useDesignStore((s) => s.boards.entities.entities.find((e) => e.id === id));
  const renameEntity = useDesignStore((s) => s.renameEntity);
  const removeEntity = useDesignStore((s) => s.removeEntity);
  const addField = useDesignStore((s) => s.addField);
  const moveField = useDesignStore((s) => s.moveField);
  const ui = useEntityBoardUi();
  const nameRef = useFocusTarget<HTMLInputElement>(entityNameKey(id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [gap, setGap] = useState<number | null>(null);

  // mid-removal: React Flow still holds the old node for one render
  if (!entity) return null;

  const resetDrag = () => {
    setDragId(null);
    setGap(null);
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const first = entity.fields[0];
    if (first) {
      ui.requestFocus(fieldNameKey(first.id));
      return;
    }
    const f = addField(id, null);
    if (f) ui.requestFocus(fieldNameKey(f));
  };

  const onDrop = (e: DragEvent<HTMLUListElement>) => {
    if (dragId === null || gap === null) return;
    e.preventDefault();
    const from = entity.fields.findIndex((f) => f.id === dragId);
    const to = dropIndex(from, gap);
    if (from >= 0 && to !== from) moveField(id, dragId, to);
    resetDrag();
  };

  return (
    <div
      className={`w-56 cursor-grab rounded-lg border bg-neutral-900 shadow-md ${
        selected ? "border-sky-400" : "border-neutral-700"
      }`}
    >
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        <input
          ref={nameRef}
          aria-label="Entity name"
          placeholder="Entity name"
          value={entity.name}
          onChange={(e) => renameEntity(id, e.target.value)}
          onKeyDown={onNameKeyDown}
          className="nodrag min-w-0 flex-1 cursor-text rounded bg-transparent px-1 py-0.5 text-sm font-semibold text-neutral-100 outline-hidden placeholder:text-neutral-600 focus:bg-neutral-800 focus:ring-2 focus:ring-sky-500/40"
        />
        <button
          type="button"
          aria-label="Delete entity"
          title="Delete entity"
          onClick={() => removeEntity(id)}
          className="nodrag rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <ul className="flex flex-col py-1" onDrop={onDrop}>
        {entity.fields.map((field, index) => (
          <FieldRow
            key={field.id}
            entityId={id}
            field={field}
            index={index}
            count={entity.fields.length}
            prevKey={index === 0 ? entityNameKey(id) : fieldNameKey(entity.fields[index - 1].id)}
            gap={gap}
            dragging={dragId !== null}
            onGap={setGap}
            onDragStart={setDragId}
            onDragEnd={resetDrag}
          />
        ))}
      </ul>
      <button
        type="button"
        aria-label="Add field"
        onClick={() => {
          const f = addField(id, null);
          if (f) ui.requestFocus(fieldNameKey(f));
        }}
        className="nodrag mx-2 mb-1.5 flex items-center gap-1 rounded px-1 py-0.5 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
      >
        <Plus className="h-3 w-3" /> field
      </button>
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
    </div>
  );
}

function FieldRow({
  entityId,
  field,
  index,
  count,
  prevKey,
  gap,
  dragging,
  onGap,
  onDragStart,
  onDragEnd,
}: {
  entityId: string;
  field: EntityField;
  index: number;
  count: number;
  prevKey: string;
  gap: number | null;
  dragging: boolean;
  onGap: (index: number | null) => void;
  onDragStart: (fieldId: string) => void;
  onDragEnd: () => void;
}) {
  const addField = useDesignStore((s) => s.addField);
  const updateField = useDesignStore((s) => s.updateField);
  const removeField = useDesignStore((s) => s.removeField);
  const moveField = useDesignStore((s) => s.moveField);
  const ui = useEntityBoardUi();
  const nameRef = useFocusTarget<HTMLInputElement>(fieldNameKey(field.id));
  const typeRef = useFocusTarget<HTMLInputElement>(fieldTypeKey(field.id));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, which: "name" | "type") => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const f = addField(entityId, field.id);
      if (f) ui.requestFocus(fieldNameKey(f));
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveField(entityId, field.id, e.key === "ArrowUp" ? index - 1 : index + 1);
      // a keyed move can detach focus
      ui.requestFocus(which === "name" ? fieldNameKey(field.id) : fieldTypeKey(field.id));
    } else if (e.key === "Backspace" && field.name === "" && field.type === "") {
      e.preventDefault();
      removeField(entityId, field.id);
      ui.requestFocus(prevKey);
    }
  };

  const dropLine =
    gap === index
      ? "shadow-[inset_0_2px_0_0_#0ea5e9]"
      : gap === count && index === count - 1
        ? "shadow-[inset_0_-2px_0_0_#0ea5e9]"
        : "";

  return (
    <li
      className={`group flex items-center gap-1 px-1 ${dropLine}`}
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        onGap(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
      }}
    >
      <span
        draggable
        title="Drag to reorder (Alt+↑/↓)"
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData(FIELD_DND_TYPE, field.id);
          const row = e.currentTarget.closest("li");
          if (row) e.dataTransfer.setDragImage(row, 12, 12);
          onDragStart(field.id);
        }}
        onDragEnd={() => onDragEnd()}
        className="nodrag flex h-6 w-3 shrink-0 cursor-grab items-center justify-center text-neutral-600 hover:text-neutral-300"
      >
        <GripVertical aria-hidden className="h-3 w-3" />
      </span>
      <input
        ref={nameRef}
        aria-label="Field name"
        placeholder="field"
        value={field.name}
        onChange={(e) => updateField(entityId, field.id, { name: e.target.value })}
        onKeyDown={(e) => onKeyDown(e, "name")}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        className={`${INPUT_CLASS} flex-1 text-neutral-200`}
      />
      <input
        ref={typeRef}
        aria-label="Field type"
        placeholder="type"
        list={ui.fieldTypeListId}
        value={field.type}
        onChange={(e) => updateField(entityId, field.id, { type: e.target.value })}
        onKeyDown={(e) => onKeyDown(e, "type")}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        className={`${INPUT_CLASS} w-20 text-sky-300/80`}
      />
      <button
        type="button"
        aria-label="Delete field"
        title="Delete field"
        onClick={() => {
          removeField(entityId, field.id);
          ui.requestFocus(prevKey);
        }}
        className="nodrag rounded p-0.5 text-neutral-600 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-400"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}
