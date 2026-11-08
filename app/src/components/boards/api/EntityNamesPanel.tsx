"use client";

import { useDesignStore } from "@/stores/design-store";

/** Same as PhaseNotes' heading. */
const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";

/** Right column on the API step (M13): the design's entity names, read-only. */
export function EntityNamesPanel() {
  const entities = useDesignStore((s) => s.boards.entities.entities);
  const named = entities.filter((e) => e.name.trim() !== "");
  return (
    <section aria-label="Entity names">
      <h2 className={HEADING}>Entities</h2>
      {named.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-500">No entities yet. Add them on the Entities step.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {named.map((e) => (
            <li
              key={e.id}
              className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 font-mono text-xs text-neutral-200"
            >
              {e.name.trim()}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
