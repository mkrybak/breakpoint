"use client";

import type { ActionEvent } from "@/lib/core";
import { formatClock, phaseConfig } from "@/stores/phase-store";
import {
  ACTION_KIND_LABEL,
  groupActionsByPhase,
} from "@/components/review/timeline";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";

export function ActionTimeline({
  actionLog,
  selectedIndex,
  onSelect,
}: {
  actionLog: ActionEvent[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}) {
  const groups = groupActionsByPhase(actionLog);

  return (
    <section className="flex flex-col gap-5">
      <h2 className={HEADING}>Action timeline</h2>
      {actionLog.length === 0 && (
        <p className="text-xs text-neutral-600">No actions recorded.</p>
      )}
      {groups.map((group) => (
        <div key={group.phase}>
          <h3 className={HEADING}>{phaseConfig(group.phase).label}</h3>
          <ol className="mt-1.5 flex flex-col gap-0.5">
            {group.events.map(({ event, index }) => {
              const active = index === selectedIndex;
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => onSelect(index)}
                    aria-pressed={active}
                    className={[
                      "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs",
                      active
                        ? "border border-sky-500/60 bg-sky-500/15 text-sky-200"
                        : "border border-transparent text-neutral-300 hover:bg-neutral-800/60",
                    ].join(" ")}
                  >
                    <span className="shrink-0 font-mono text-[10px] text-neutral-500">
                      {formatClock(event.t)}
                    </span>
                    <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-neutral-400 uppercase">
                      {ACTION_KIND_LABEL[event.kind]}
                    </span>
                    <span className="truncate">{event.detail}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
