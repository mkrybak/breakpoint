import type {
  ActionEvent,
  ActionKind,
  DesignEdge,
  DesignGraph,
  DesignNode,
  Phase,
  StressRule,
} from "@/lib/core";

/**
 * A recorded action before the interview-clock envelope (t + phase) is attached.
 * The shell stamps it via `stampAction` using the phase store's clock.
 */
export interface DraftAction {
  kind: ActionKind;
  detail: string;
}

/** Attach the interview clock (seconds since start + current phase) to a draft. */
export function stampAction(
  draft: DraftAction,
  t: number,
  phase: Phase,
): ActionEvent {
  return { t, phase, kind: draft.kind, detail: draft.detail };
}

function endpointLabels(
  edge: DesignEdge,
  nodes: Map<string, DesignNode>,
): string {
  const source = nodes.get(edge.source)?.label ?? edge.source;
  const target = nodes.get(edge.target)?.label ?? edge.target;
  return `${source} → ${target}`;
}

function changedConfigKeys(
  before: DesignNode["config"],
  after: DesignNode["config"],
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (before[key] !== after[key]) changed.push(key);
  }
  return changed;
}

/**
 * Diff two design graphs into the ordered candidate actions between them:
 * node adds, node removes, renames, config changes, edge adds, edge removes.
 * Position and selection changes produce nothing — they are not graph fields —
 * so dragging a node or clicking it records no events.
 */
export function diffGraph(prev: DesignGraph, next: DesignGraph): DraftAction[] {
  const drafts: DraftAction[] = [];
  const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]));

  for (const node of next.nodes) {
    if (!prevNodes.has(node.id)) {
      drafts.push({ kind: "node_added", detail: `added ${node.label}` });
    }
  }
  for (const node of prev.nodes) {
    if (!nextNodes.has(node.id)) {
      drafts.push({ kind: "node_removed", detail: `removed ${node.label}` });
    }
  }
  for (const node of next.nodes) {
    const before = prevNodes.get(node.id);
    if (!before) continue;
    if (before.label !== node.label) {
      drafts.push({
        kind: "node_renamed",
        detail: `renamed ${before.label} → ${node.label}`,
      });
    }
    for (const key of changedConfigKeys(before.config, node.config)) {
      drafts.push({
        kind: "config_changed",
        detail: `set ${key}: ${String(node.config[key])} on ${node.label}`,
      });
    }
  }

  const prevEdges = new Map(prev.edges.map((e) => [e.id, e]));
  const nextEdges = new Map(next.edges.map((e) => [e.id, e]));
  for (const edge of next.edges) {
    if (!prevEdges.has(edge.id)) {
      drafts.push({
        kind: "edge_added",
        detail: `connected ${endpointLabels(edge, nextNodes)}`,
      });
    }
  }
  for (const edge of prev.edges) {
    if (!nextEdges.has(edge.id)) {
      drafts.push({
        kind: "edge_removed",
        detail: `disconnected ${endpointLabels(edge, prevNodes)}`,
      });
    }
  }
  return drafts;
}

/** Interview phase transition (the phase just entered). */
export function phaseStartedAction(phase: Phase): DraftAction {
  return { kind: "phase_started", detail: `entered ${phase}` };
}

/** A phase note was edited (the caller debounces bursts of typing). */
export function noteEditedAction(): DraftAction {
  return { kind: "note_edited", detail: "edited notes" };
}

/** The candidate launched the simulation. */
export function simRunAction(scenarioName: string): DraftAction {
  return { kind: "sim_run", detail: `ran ${scenarioName}` };
}

/** The interviewer injected a live chaos rule. */
export function chaosAction(rule: StressRule): DraftAction {
  return { kind: "chaos_injected", detail: describeChaosDetail(rule) };
}

/** Compact, plain-text chaos description (mirrors sim-store's describeChaos, no emoji). */
function describeChaosDetail(rule: StressRule): string {
  switch (rule.rule) {
    case "kill":
      return `killed ${rule.count ?? 1} × ${rule.target}`;
    case "flush":
      return "flushed cache";
    case "spike":
      return `spike ×${rule.factor}`;
    case "ramp":
      return `ramp → ${rule.toRps} RPS`;
    case "partition":
      return `partition ${rule.target}`;
    case "hotkey":
      return `hotkey skew ${rule.skew}`;
  }
}
