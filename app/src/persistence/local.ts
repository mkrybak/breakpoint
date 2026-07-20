import type {
  ActionEvent,
  DesignEdge,
  DesignGraph,
  DesignNode,
  Phase,
  RunResult,
  Scenario,
  Verdict,
} from "@/lib/core";
import type { Scorecard } from "@/lib/grading";
import { COMPONENT_KINDS } from "@/lib/registry";
import { parseScenario } from "@/lib/scenarios";
import { parseScorecard, scorecardStorageKey } from "./scorecard";

/** Persisted/exported design (02-data-model). localStorage key: bp:design:<id>. */
export interface DesignRecord {
  id: string;
  name: string;
  scenarioId: string;
  graph: DesignGraph;
  phaseNotes: Record<Phase, string>;
  actionLog: ActionEvent[];
  /** ISO timestamp */
  updatedAt: string;
}

const KEY_PREFIX = "bp:design:";

const PHASES: Phase[] = ["requirements", "entities", "api", "hld", "deepdive"];

export function designStorageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

export function emptyPhaseNotes(): Record<Phase, string> {
  return { requirements: "", entities: "", api: "", hld: "", deepdive: "" };
}

/** Assembles the persisted shape; scenarioId stays empty until a run/export sets it. */
export function buildDesignRecord(
  id: string,
  name: string,
  graph: DesignGraph,
  phaseNotes: Record<Phase, string> = emptyPhaseNotes(),
  actionLog: ActionEvent[] = [],
): DesignRecord {
  return {
    id,
    name,
    scenarioId: "",
    graph,
    phaseNotes,
    actionLog,
    updatedAt: new Date().toISOString(),
  };
}

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Best-effort: silently no-ops without localStorage (SSR, node tests) or on quota errors. */
export function saveDesign(record: DesignRecord): void {
  try {
    storage()?.setItem(designStorageKey(record.id), JSON.stringify(record));
  } catch {
    // autosave must never take the app down
  }
}

export function loadDesign(id: string): DesignRecord | null {
  try {
    const text = storage()?.getItem(designStorageKey(id));
    return text == null ? null : parseDesignRecord(text);
  } catch {
    return null;
  }
}

/**
 * Hand-rolled import guard (02-data-model): strict on the graph — an unknown
 * node kind would crash the canvas — forgiving on the rest, so files missing
 * M4-era fields still load with defaults.
 */
export function parseDesignRecord(text: string): DesignRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  if (!isValidGraph(value.graph)) return null;

  const phaseNotes = emptyPhaseNotes();
  if (isRecord(value.phaseNotes)) {
    for (const phase of PHASES) {
      const note = value.phaseNotes[phase];
      if (typeof note === "string") phaseNotes[phase] = note;
    }
  }

  return {
    id: value.id,
    name: value.name,
    scenarioId: typeof value.scenarioId === "string" ? value.scenarioId : "",
    graph: value.graph,
    phaseNotes,
    actionLog: Array.isArray(value.actionLog)
      ? value.actionLog.filter(isValidActionEvent)
      : [],
    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

/** Triggers a browser download of the record as <slug>.design.json. */
export function exportDesignFile(record: DesignRecord): void {
  const slug =
    record.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "design";
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.design.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** All saved designs, most-recently-updated first. Skips unparseable entries. */
export function listDesigns(): DesignRecord[] {
  const store = storage();
  if (!store) return [];
  const records: DesignRecord[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key == null || !key.startsWith(KEY_PREFIX)) continue;
      const text = store.getItem(key);
      const record = text == null ? null : parseDesignRecord(text);
      if (record) records.push(record);
    }
  } catch {
    return records;
  }
  // ISO timestamps sort lexicographically; newest first.
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Removes a design and its scorecard (if any). Best-effort. */
export function deleteDesign(id: string): void {
  try {
    const store = storage();
    store?.removeItem(designStorageKey(id));
    store?.removeItem(scorecardStorageKey(id));
  } catch {
    // deletion must never take the app down
  }
}

/**
 * Renames a saved design and bumps updatedAt. Returns the updated record, or
 * null if the id is unknown or the trimmed name is blank (no write in that case).
 */
export function renameDesign(id: string, name: string): DesignRecord | null {
  const trimmed = name.trim();
  if (trimmed === "") return null;
  const record = loadDesign(id);
  if (!record) return null;
  const updated: DesignRecord = {
    ...record,
    name: trimmed,
    updatedAt: new Date().toISOString(),
  };
  saveDesign(updated);
  return updated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidNode(value: unknown): value is DesignNode {
  if (!isRecord(value)) return false;
  const position = value.position;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.kind === "string" &&
    (COMPONENT_KINDS as string[]).includes(value.kind) &&
    isRecord(position) &&
    isFiniteNumber(position.x) &&
    isFiniteNumber(position.y) &&
    isRecord(value.config) &&
    Object.values(value.config).every((v) =>
      ["number", "string", "boolean"].includes(typeof v),
    )
  );
}

function isValidEdge(value: unknown): value is DesignEdge {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    isFiniteNumber(value.trafficShare) &&
    (value.autoShare === undefined || typeof value.autoShare === "boolean") &&
    (value.kind === "sync" || value.kind === "async")
  );
}

function isValidGraph(value: unknown): value is DesignGraph {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.nodes) &&
    value.nodes.every(isValidNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isValidEdge) &&
    typeof value.entryNodeId === "string"
  );
}

/** kind is only checked to be a string — the ActionKind union is M4's concern. */
function isValidActionEvent(value: unknown): value is ActionEvent {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.t) &&
    PHASES.includes(value.phase as Phase) &&
    typeof value.kind === "string" &&
    typeof value.detail === "string"
  );
}

/** The export file the grader imports: <name>.breakpoint.json (02-data-model). */
export interface RunBundle {
  version: 1;
  design: DesignRecord;
  /** Frozen copy — replay survives preset changes. */
  scenario: Scenario;
  result: RunResult;
  scorecard?: Scorecard;
}

/** Parsing an untrusted bundle file: the value, or a human-readable reason. */
export type RunBundleParseResult =
  | { ok: true; bundle: RunBundle }
  | { ok: false; error: string };

/** Assembles a RunBundle; scorecard is included only when provided. */
export function buildRunBundle(
  design: DesignRecord,
  scenario: Scenario,
  result: RunResult,
  scorecard?: Scorecard,
): RunBundle {
  const bundle: RunBundle = { version: 1, design, scenario, result };
  if (scorecard) bundle.scorecard = scorecard;
  return bundle;
}

/**
 * Hand-rolled schema guard (02-data-model). Reuses parseDesignRecord /
 * parseScenario / parseScorecard and validates the RunResult shape via
 * parseRunResult. Returns a readable error string for the review screen on any
 * malformed section — never throws.
 */
export function parseRunBundle(text: string): RunBundleParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn’t valid JSON." };
  }
  if (!isRecord(value)) {
    return { ok: false, error: "This file isn’t a run bundle." };
  }
  if (value.version !== 1) {
    return {
      ok: false,
      error: `Unsupported bundle version ${String(value.version)} (expected 1).`,
    };
  }
  const design = parseDesignRecord(JSON.stringify(value.design));
  if (!design) {
    return { ok: false, error: "The bundle’s design is missing or invalid." };
  }
  const scenario = parseScenario(value.scenario);
  if (!scenario) {
    return { ok: false, error: "The bundle’s scenario is missing or invalid." };
  }
  const result = parseRunResult(value.result);
  if (!result) {
    return {
      ok: false,
      error: "The bundle’s simulation result is missing or invalid.",
    };
  }
  let scorecard: Scorecard | undefined;
  if (value.scorecard !== undefined) {
    const parsed = parseScorecard(JSON.stringify(value.scorecard));
    if (!parsed) {
      return { ok: false, error: "The bundle’s scorecard is invalid." };
    }
    scorecard = parsed;
  }
  return {
    ok: true,
    bundle: buildRunBundle(design, scenario, result, scorecard),
  };
}

/** Triggers a browser download of the bundle as <slug>.breakpoint.json. */
export function exportRunBundleFile(bundle: RunBundle): void {
  const slug =
    bundle.design.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "run";
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.breakpoint.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Guard for RunResult: strict on the design snapshot (an unknown node kind would
 * crash the replay canvas — reuses isValidGraph), forgiving on frames — they pass
 * through verbatim so an imported run replays byte-identically to the original.
 */
function parseRunResult(value: unknown): RunResult | null {
  if (!isRecord(value)) return null;
  const designSnapshot = value.designSnapshot;
  const frames = value.frames;
  const verdict = value.verdict;
  if (!isValidGraph(designSnapshot)) return null;
  if (!Array.isArray(frames)) return null;
  if (!isValidVerdict(verdict)) return null;
  return {
    scenarioId: typeof value.scenarioId === "string" ? value.scenarioId : "",
    designSnapshot,
    frames: frames as RunResult["frames"],
    verdict,
  };
}

function isValidVerdict(value: unknown): value is Verdict {
  if (!isRecord(value)) return false;
  return (
    typeof value.passed === "boolean" &&
    Array.isArray(value.failures) &&
    Array.isArray(value.advisories)
  );
}
