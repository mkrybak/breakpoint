/** Interview phases (02-data-model) — phaseNotes keys and ActionEvent.phase. */
export type Phase = "requirements" | "entities" | "api" | "hld" | "deepdive";

export type ActionKind =
  | "node_added"
  | "node_removed"
  | "node_renamed"
  | "config_changed"
  | "edge_added"
  | "edge_removed"
  | "note_edited"
  | "phase_started"
  | "sim_run"
  | "chaos_injected";

/** One recorded candidate action; the review screen renders these as a timeline. */
export interface ActionEvent {
  /** seconds since interview start */
  t: number;
  phase: Phase;
  kind: ActionKind;
  detail: string;
}
