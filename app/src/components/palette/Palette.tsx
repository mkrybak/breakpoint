"use client";

import type { DragEvent } from "react";
import { ComponentIcon } from "@/components/icons";
import {
  CATEGORY_ORDER,
  COMPONENT_DEFS,
  type ComponentCategory,
  type ComponentDef,
} from "@/lib/registry";

/** dataTransfer MIME type for palette drags; the canvas drop handler keys on it. */
export const PALETTE_DND_TYPE = "application/x-breakpoint-component";

const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  entry: "Entry",
  network: "Network",
  compute: "Compute",
  storage: "Storage",
  async: "Async",
};

function onDragStart(event: DragEvent<HTMLLIElement>, def: ComponentDef) {
  event.dataTransfer.setData(PALETTE_DND_TYPE, def.kind);
  event.dataTransfer.effectAllowed = "move";
}

export function Palette() {
  const defs = Object.values(COMPONENT_DEFS);
  return (
    <aside className="w-56 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Components
      </h2>
      {CATEGORY_ORDER.map((category) => {
        const group = defs.filter((def) => def.category === category);
        if (group.length === 0) return null;
        return (
          <section key={category} className="mt-4">
            <h3 className="text-[10px] font-medium tracking-wider text-neutral-500 uppercase">
              {CATEGORY_LABELS[category]}
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {group.map((def) => (
                <li
                  key={def.kind}
                  draggable
                  onDragStart={(event) => onDragStart(event, def)}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 select-none hover:border-neutral-600 active:cursor-grabbing"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${def.color}33`, color: def.color }}
                  >
                    <ComponentIcon name={def.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-xs font-medium text-neutral-200">
                    {def.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
