import type { ActionEvent, ActionKind, Phase } from "@/lib/core";

/** One timeline row: the event plus its index into the full `actionLog`. */
export interface TimelineEntry {
  event: ActionEvent;
  index: number;
}

/** Events for one interview phase, in chronological (log) order. */
export interface PhaseGroup {
  phase: Phase;
  events: TimelineEntry[];
}

/** Canonical phase order (mirrors PHASES in phase-store / PHASES in persistence). */
const PHASE_ORDER: Phase[] = [
  "requirements",
  "entities",
  "api",
  "hld",
  "deepdive",
];

/**
 * Group the action log into per-phase sections in interview order, preserving each
 * event's global index into `actionLog`. Only phases that have events appear.
 * Within a group, events keep their chronological order.
 */
export function groupActionsByPhase(actionLog: ActionEvent[]): PhaseGroup[] {
  const byPhase = new Map<Phase, TimelineEntry[]>();
  actionLog.forEach((event, index) => {
    const list = byPhase.get(event.phase);
    if (list) list.push({ event, index });
    else byPhase.set(event.phase, [{ event, index }]);
  });
  return PHASE_ORDER.filter((phase) => byPhase.has(phase)).map((phase) => ({
    phase,
    events: byPhase.get(phase) ?? [],
  }));
}

/** Compact badge label per action kind, for the timeline. */
export const ACTION_KIND_LABEL: Record<ActionKind, string> = {
  node_added: "add",
  node_removed: "remove",
  node_renamed: "rename",
  config_changed: "config",
  edge_added: "connect",
  edge_removed: "disconnect",
  note_edited: "note",
  phase_started: "phase",
  sim_run: "run",
  chaos_injected: "chaos",
};
