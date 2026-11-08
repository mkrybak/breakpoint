"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { GripVertical, X } from "lucide-react";
import type {
  RequirementItem,
  RequirementListKey,
  RequirementsBoard as RequirementsBoardData,
} from "@/lib/core";
import { useDesignStore } from "@/stores/design-store";
import { dropIndex, seedNonFunctionalOnce } from "./requirements";

export type RequirementsBoardProps =
  | { readOnly?: false }
  | { readOnly: true; board: RequirementsBoardData };

interface ColumnConfig {
  list: RequirementListKey;
  title: string;
  placeholder: string;
  empty: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    list: "functional",
    title: "Functional",
    placeholder: "e.g. Users can place an order",
    empty: "What must the system do? Press Enter to add the next one.",
  },
  {
    list: "nonFunctional",
    title: "Non-functional",
    placeholder: "e.g. 99.9% availability",
    empty: "Scale, latency, availability, consistency…",
  },
];

const COLUMN_SHELL =
  "flex flex-col rounded-lg border border-neutral-800 bg-neutral-900/60 p-3";
const COLUMN_HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const DRAG_MIME = "application/x-bp-requirement";

/** The Requirements step board (M13): Functional and Non-functional lists, editable or read-only (review). */
export function RequirementsBoard(props: RequirementsBoardProps) {
  return props.readOnly ? (
    <ReadOnlyRequirements board={props.board} />
  ) : (
    <RequirementsEditor />
  );
}

/** Workspace-level: seed Non-functional once the design is attached (Practice/Interview only). */
export function useSeedNonFunctional(designId: string): void {
  const attachedId = useDesignStore((s) => s.designId);
  // Keyed on the store's designId so it runs only after attachDesign has loaded
  // the saved record (parent effects run after child effects). Zustand actions
  // are not React setState, so this does not trip react-hooks/set-state-in-effect.
  useEffect(() => {
    if (attachedId === designId) seedNonFunctionalOnce(designId);
  }, [attachedId, designId]);
}

function ScenarioTag() {
  return (
    <span
      title="Seeded from the scenario's targets"
      className="shrink-0 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-sky-300 uppercase"
    >
      scenario
    </span>
  );
}

function RequirementsEditor() {
  return (
    <div className="p-6">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4">
        {COLUMNS.map((column) => (
          <RequirementColumn key={column.list} {...column} />
        ))}
      </div>
    </div>
  );
}

function RequirementColumn({ list, title, placeholder, empty }: ColumnConfig) {
  const items = useDesignStore((s) => s.boards.requirements[list]);
  const addRequirement = useDesignStore((s) => s.addRequirement);
  const updateRequirement = useDesignStore((s) => s.updateRequirement);
  const removeRequirement = useDesignStore((s) => s.removeRequirement);
  const moveRequirement = useDesignStore((s) => s.moveRequirement);
  const headingId = useId();

  const inputs = useRef(new Map<string, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const focusRequest = useRef<{ id: string } | "add" | null>(null);

  // Runs after every commit: an action that needs focus sets focusRequest, then
  // calls the store; the re-render lands here. A keyed reorder may detach the
  // focused input, so moves re-focus this way too.
  useLayoutEffect(() => {
    const req = focusRequest.current;
    if (req === null) return;
    focusRequest.current = null;
    if (req === "add") {
      addButton.current?.focus();
      return;
    }
    const el = inputs.current.get(req.id);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const [dragId, setDragId] = useState<string | null>(null);
  const [gap, setGap] = useState<number | null>(null);

  const endDrag = () => {
    setDragId(null);
    setGap(null);
  };

  const onListDragOver = (e: DragEvent<HTMLOListElement>) => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: DragEvent<HTMLOListElement>) => {
    if (dragId === null || gap === null) return;
    e.preventDefault();
    const from = items.findIndex((i) => i.id === dragId);
    if (from >= 0) {
      const to = dropIndex(from, gap);
      if (to !== from) {
        focusRequest.current = null;
        moveRequirement(list, dragId, to);
      }
    }
    endDrag();
  };

  const onRowDragOver = (e: DragEvent<HTMLLIElement>, index: number) => {
    // Ignores other columns and foreign drags: only this column's handle sets dragId.
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = e.currentTarget.getBoundingClientRect();
    const next = e.clientY < r.top + r.height / 2 ? index : index + 1;
    if (next !== gap) setGap(next);
  };

  const focusInput = (id: string) => {
    const el = inputs.current.get(id);
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  };

  const onItemKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    item: RequirementItem,
    index: number,
  ) => {
    if (e.nativeEvent.isComposing) return;
    const noModifier = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (e.key === "Enter") {
      e.preventDefault();
      const id = addRequirement(list, item.id);
      focusRequest.current = { id };
    } else if (e.key === "Backspace" && item.text === "" && noModifier) {
      e.preventDefault();
      const prev = items[index - 1] ?? items[index + 1];
      focusRequest.current = prev ? { id: prev.id } : "add";
      removeRequirement(list, item.id);
    } else if (e.key === "ArrowUp" && e.altKey && index > 0) {
      e.preventDefault();
      focusRequest.current = { id: item.id };
      moveRequirement(list, item.id, index - 1);
    } else if (e.key === "ArrowDown" && e.altKey && index < items.length - 1) {
      e.preventDefault();
      focusRequest.current = { id: item.id };
      moveRequirement(list, item.id, index + 1);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && noModifier) {
      const neighbour = items[e.key === "ArrowUp" ? index - 1 : index + 1];
      if (neighbour) {
        e.preventDefault();
        focusInput(neighbour.id);
      }
    }
  };

  return (
    <section aria-labelledby={headingId} className={COLUMN_SHELL}>
      <div className="flex items-baseline justify-between gap-2 px-2">
        <h2 id={headingId} className={COLUMN_HEADING}>
          {title}
        </h2>
        <span className="text-[10px] text-neutral-600">{items.length}</span>
      </div>
      {items.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-neutral-500">{empty}</p>
      )}
      <ol
        className="mt-2 flex flex-col gap-0.5"
        onDragOver={onListDragOver}
        onDrop={onDrop}
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            className={`group relative flex items-center gap-1.5 rounded transition-opacity duration-150 ${dragId === item.id ? "opacity-40" : ""}`}
            onDragOver={(e) => onRowDragOver(e, index)}
          >
            {gap === index && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-px h-0.5 rounded bg-sky-500"
              />
            )}
            {gap === items.length && index === items.length - 1 && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded bg-sky-500"
              />
            )}
            <span
              draggable
              title="Drag to reorder"
              className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-neutral-600 transition-colors duration-150 hover:text-neutral-300"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(DRAG_MIME, item.id);
                const row = e.currentTarget.closest("li");
                if (row) e.dataTransfer.setDragImage(row, 16, 16);
                setDragId(item.id);
              }}
              onDragEnd={endDrag}
            >
              <GripVertical aria-hidden className="h-3.5 w-3.5" />
            </span>
            <input
              ref={(el) => {
                if (el) inputs.current.set(item.id, el);
                return () => {
                  inputs.current.delete(item.id);
                };
              }}
              type="text"
              value={item.text}
              placeholder={placeholder}
              spellCheck={false}
              aria-label={`${title} requirement ${index + 1}`}
              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
              onChange={(e) => updateRequirement(list, item.id, e.target.value)}
              onKeyDown={(e) => onItemKeyDown(e, item, index)}
              className="min-h-8 min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-sm text-neutral-100 outline-hidden transition-colors duration-150 placeholder:text-neutral-600 hover:bg-neutral-800/60 focus:bg-neutral-800 focus:ring-2 focus:ring-sky-500/40"
            />
            {item.source === "scenario" && <ScenarioTag />}
            <button
              type="button"
              aria-label={`Delete ${title.toLowerCase()} requirement ${index + 1}`}
              title="Delete"
              onClick={() => removeRequirement(list, item.id)}
              className="flex h-8 w-6 shrink-0 items-center justify-center rounded text-neutral-600 transition-colors duration-150 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-hidden"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ol>
      <button
        ref={addButton}
        type="button"
        aria-label={`Add ${title.toLowerCase()} requirement`}
        onClick={() => {
          const id = addRequirement(list);
          focusRequest.current = { id };
        }}
        className="mt-1 min-h-8 self-start rounded px-2 py-1 text-xs text-neutral-500 transition-colors duration-150 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-hidden"
      >
        + add requirement
      </button>
    </section>
  );
}

function ReadOnlyRequirements({ board }: { board: RequirementsBoardData }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {COLUMNS.map(({ list, title }) => (
        <ReadOnlyColumn key={list} title={title} items={board[list]} />
      ))}
    </div>
  );
}

function ReadOnlyColumn({
  title,
  items,
}: {
  title: string;
  items: RequirementItem[];
}) {
  const headingId = useId();
  const written = items.filter((i) => i.text.trim() !== "");
  return (
    <section aria-labelledby={headingId} className={COLUMN_SHELL}>
      <h2 id={headingId} className={`${COLUMN_HEADING} px-2`}>
        {title}
      </h2>
      {written.length === 0 ? (
        <p className="px-2 py-1 text-xs text-neutral-500 italic">
          None written.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {written.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-neutral-200"
            >
              <span className="min-w-0 flex-1 break-words">{item.text}</span>
              {item.source === "scenario" && <ScenarioTag />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
