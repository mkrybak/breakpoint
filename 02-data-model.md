---
tags: [spec, data-model]
status: planning
---

# 02 — Data model

Three schemas do all the work: **ComponentDef** (what can be placed), **DesignGraph** (what the candidate built), **Scenario** (what we throw at it). Everything else derives from them.

## ComponentDef — the palette registry

Adding a new component to the platform = adding one entry here. No code changes.

```ts
type ComponentKind =
  | "client" | "lb" | "api_gateway" | "app_server" | "cache" | "db_sql"
  | "db_nosql" | "queue" | "stream" | "cdn" | "blob" | "search" | "worker";

type ComponentCategory = "entry" | "network" | "compute" | "storage" | "async";

interface ComponentDef {
  kind: ComponentKind;
  label: string;              // "Postgres", "Redis", "Kafka"
  category: ComponentCategory; // palette grouping
  icon: string;               // lucide icon name
  color: string;              // node accent
  // capacity model — the "numbers to know" (2026)
  capacity: {
    rps?: number;             // max ops/s per instance; omitted = unlimited (∞)
    writeRps?: number;        // separate write ceiling if it differs (db: ~15k)
    storageGb?: number;       // soft limit before "consider sharding" warning
    connections?: number;
  };
  latency: { baseMs: number };            // service time at low utilization
  consistency: "strong" | "eventual" | "n/a";
  scaling: "horizontal" | "vertical" | "managed";  // horizontal = user can set replicas
  configFields: ConfigField[];  // e.g. cache: hitRate slider; db: replicas, sharding
}

type ConfigField =
  | { key: string; label: string; type: "number";
      min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: "boolean"; default: boolean }
  | { key: string; label: string; type: "select";
      options: string[]; default: string };
```

Seed registry values (from the numbers-to-know cheat sheet):

| kind | rps | writeRps | baseMs | notes |
|---|---|---|---|---|
| app_server | 4 000 | — | 8 | CPU-bound; horizontal |
| db_sql | 30 000 read | 15 000 | 5 | single primary; replicas add read capacity |
| db_nosql | 50 000 | 30 000 | 3 | horizontal, eventual by default |
| cache | 100 000 | 100 000 | 1 | hitRate config 0–0.95 |
| queue/stream | 800 000 | — | 4 | adds delivery latency, absorbs bursts |
| lb | 100 000 | — | 1 | — |
| cdn | ∞ | — | 15 | hitRate config; only for static/read edges |
| blob | ∞ | — | 50 | — |
| search | 10 000 | 2 000 | 20 | — |

## DesignGraph — what the candidate draws

Thin wrapper over React Flow's serialization; stored verbatim (localStorage / export file).

```ts
interface DesignNode {
  id: string;
  kind: ComponentKind;
  label: string;              // candidate's name for it
  position: { x: number; y: number };
  config: Record<string, number | string | boolean>;
  // e.g. { replicas: 3, hitRate: 0.8, sharded: true, consistencyMode: "quorum" }
}

interface DesignEdge {
  id: string;
  source: string; target: string;
  trafficShare: number;       // 0–1, fraction of source's outbound on this edge
  kind: "sync" | "async";     // async = via queue semantics, no latency on client path
}

interface DesignGraph { nodes: DesignNode[]; edges: DesignEdge[]; entryNodeId: string; }
```

## Scenario — the stress rules

```ts
type StressRule =
  | { at: number; rule: "ramp";  toRps: number; overSec: number }
  | { at: number; rule: "spike"; factor: number; forSec: number }
  | { at: number; rule: "kill";  target: string /* kind or nodeId */; count?: number }
  | { at: number; rule: "flush"; target: "cache" }
  | { at: number; rule: "partition"; target: string; forSec: number }
  | { at: number; rule: "hotkey"; skew: number; forSec: number };

interface Scenario {
  id: string; name: string; description: string;
  durationSec: number;
  baseRps: number;
  readRatio: number;          // 0–1
  timeline: StressRule[];
  pass: {                     // = the NFRs; interviewer can edit before run
    p95Ms: number;
    maxErrorRate: number;     // e.g. 0.01
    consistency?: "strong";   // if set, verdict checks read-path consistency
    minSurvivedKills?: number;
  };
  seed: number;               // determinism
}
```

## Sim output

```ts
interface SimFrame {           // one per tick (100ms), streamed worker → UI
  t: number;
  perNode: Record<string, { util: number; queued: number; dropped: number; state: "ok"|"hot"|"saturated"|"overloaded"|"down" }>;
  perEdge: Record<string, { rps: number }>;
  p95Ms: number; errorRate: number; servedRps: number;
  events: string[];            // log lines emitted this tick
}

interface VerdictFailure { criterion: string; atSec: number; detail: string }

interface Verdict {
  passed: boolean;
  failures: VerdictFailure[];
  advisories: string[];        // don't fail the run — shown to the grader
}

interface RunResult {
  scenarioId: string; designSnapshot: DesignGraph;
  frames: SimFrame[];          // full replay
  verdict: Verdict;
}
```

## ActionEvent — "watching what the candidate does"

Every meaningful candidate action is recorded with a timestamp and interview phase. This is what a human grader replays to grade the process, not just the final graph.

```ts
type ActionKind =
  | "node_added" | "node_removed" | "node_renamed" | "config_changed"
  | "edge_added" | "edge_removed" | "note_edited"
  | "phase_started" | "sim_run" | "chaos_injected";

interface ActionEvent {
  t: number;                  // seconds since interview start
  phase: "requirements" | "entities" | "api" | "hld" | "deepdive";
  kind: ActionKind;
  detail: string;             // "added Redis cache", "set replicas: 3 on Postgres"
}
```

Stored as `actionLog` on the design. The review screen renders it as a timeline next to the sim replay — the grader sees *when* the candidate reached for a queue and whether it was before or after the design broke.

## Persistence (local-first, no DB — decision 2026-07-12)

Everything is plain JSON, so persistence is trivial:

```ts
interface DesignRecord {       // localStorage key: bp:design:<id>
  id: string; name: string; scenarioId: string;
  graph: DesignGraph;
  phaseNotes: Record<Phase, string>;   // framework artifacts: reqs, NFRs, entities, API sketch
  actionLog: ActionEvent[];
  updatedAt: string;           // ISO
}

interface RunBundle {          // the export file the grader imports: <name>.breakpoint.json
  version: 1;
  design: DesignRecord;
  scenario: Scenario;          // frozen copy — replay works even if presets change
  result: RunResult;
  scorecard?: Scorecard;       // grader fills, re-exports as graded report
}

interface Scorecard {
  runExportedAt: string;
  rubricScores: Record<Phase, { score: 1 | 2 | 3 | 4 | 5; feedbackMd: string }>;
  overall: "strong-hire" | "hire" | "no-hire";
}
```

localStorage autosaves the working design; export/import moves bundles between candidate and grader as files. A schema guard (zod-free, hand-rolled in `scenarios`-style) validates imports.

### If a database returns (post-MVP: hosting, accounts, or AI grading)

Everything above is JSON-serializable by design, so the migration is mechanical — each record becomes a JSONB column. The dropped Drizzle sketch, for reference (app-side code recoverable from `app/` git history, commit `5de2a01`):

```
users        (id, email, name, role: candidate|interviewer, created_at)
scenarios    (id, owner_id, json JSONB, is_preset bool)
designs      (id, user_id, scenario_id, graph JSONB, phase_notes JSONB, action_log JSONB, updated_at)
runs         (id, design_id, result JSONB, passed bool, created_at)
scorecards   (id, run_id, grader_id → users, rubric_scores JSONB, feedback_md text, created_at)
```

## Decisions

- 2026-07-12: `trafficShare` on edges instead of inferring routing — explicit and simple; validation warns when outbound shares don't sum to 1.
- 2026-07-12 (T-1.1 planning): `ConfigField` defined as a discriminated union (`number` | `boolean` | `select`) — was referenced but never specified.
- 2026-07-12 (T-1.1 planning): added `category` to `ComponentDef` — T-1.3's palette groups by category and the registry must stay the single source of truth.
- 2026-07-12 (T-1.1 planning): unlimited capacity (cdn/blob "∞") = **omitted** capacity field, never `Infinity` — engine boundary data must survive `JSON.stringify` (05-engines rule 4).
- 2026-07-12 (T-1.1 planning): `ComponentKind`/`ComponentCategory`/`ConfigField`/`ComponentDef` are **defined in `core`** (per the 05-engines table — `DesignNode.kind` in core needs `ComponentKind`); `registry/types.ts` re-exports them, satisfying the T-1.1 file list.
- 2026-07-12 (T-1.2 planning): `DesignNode`/`DesignEdge`/`DesignGraph` defined in `core` (`core/design.ts`), per the 05-engines table — same pattern as the T-1.1 component types. React Flow conversion lives in the shell (`src/stores/flow-adapter.ts`, `toFlow`/`fromFlow`) — engines never see `@xyflow` types; `entryNodeId` resolution rule: keep previous if the node still exists, else first `client` node, else `""`.
- 2026-07-12 (T-1.2 fix): DOM-measured node sizes are **ephemeral shell state** (`measured` map in design-store, echoed back to React Flow by `toFlow`) — never part of `DesignGraph`, never serialized. React Flow 12 keeps nodes `visibility: hidden` unless the dimensions it reports via `onNodesChange` come back on the `nodes` prop; stripping them in the round-trip left the canvas blank.
- 2026-07-12 (T-1.4 planning): validation semantics — shares epsilon 0.001 (sync+async both count toward a node's outbound sum); orphan = node with no edges either direction; entry-client check skipped on empty graph; sync cycles = Tarjan SCCs (size>1 or self-loop) on the sync-edge subgraph. New edges default trafficShare 1 / sync; duplicate source→target connections are no-ops.
- 2026-07-13 (T-2.1 planning): `Scenario`/`StressRule` (in) and `SimFrame`/`RunResult` (out) are **defined in `core`** (`core/scenario.ts`, `core/sim-result.ts`), per the 05-engines table — `simulation` may only import `core`, and the future `scenarios` engine (M3) needs `Scenario`/`StressRule` too, so they can't live inside `simulation`. `simulation/types.ts` re-exports both, mirroring `registry/types.ts`. `SimFrame.perNode[].state` is factored into a named `NodeState` union (reused by `node-models.ts` and `engine.ts` later) instead of an inline literal.
- 2026-07-12 (T-1.5 planning): persistence — DesignRecord stored verbatim under `bp:design:<id>` with M4-owned fields stubbed (`scenarioId: ""`, empty phaseNotes, `actionLog: []`; no version field — only RunBundle has one). Autosave = 500ms-debounced zustand subscription; attaching a design is not an edit (no echo-save). Import guard: strict on the graph (kind must exist in the registry), forgiving elsewhere (defaults filled, bad actionLog entries dropped); imported record's `id` is ignored — the URL's design slot wins. Store round-trips only graph+name until M4. Config number fields render as number inputs, not sliders (precision; matches the edge inspector). Phase/ActionKind/ActionEvent now live in `core/action.ts`.
- 2026-07-13 (T-2.6 planning): `RunResult` carries a structured `verdict: Verdict { passed, failures: VerdictFailure[], advisories }` (03's documented verdict output) instead of the flat `passed`/`failures: string[]` sketch — nothing constructed RunResult yet, so the reshape was free. Types live in `core/sim-result.ts`; `criterion` stays a plain string so new checks never touch core. db_sql gained a `readYourWrites` boolean configField (registry data) — 03's consistency check names it and the registry never grew it.
- 2026-07-14 (T-3.1 planning): the `scenarios` engine loads its `presets/*.json` through a hand-rolled `parseScenario(data: unknown): Scenario | null` guard (the "zod-free, scenarios-style" guard 02 names, mirroring persistence's `parseDesignRecord`) — JSON imports widen `rule`/`consistency` to `string`, so an `as Scenario` cast is unsound; the guard rebuilds a correctly-typed value and presets fail loudly at module load. M5's RunBundle import reuses it. `describeStressRule(rule): string` (pure, raw numbers, no locale) renders one timeline line for the ScenarioPanel preview. Interviewer NFR edits live in a new shell store `scenario-store.ts` holding a working `Scenario` (a `structuredClone` of the selected preset); the strong-consistency toggle adds/removes `pass.consistency`. `sim-store.ts` (T-3.2) will read this working scenario to launch the worker.
- 2026-07-14 (T-3.2 planning): `sim-store.ts` (zustand shell) drives the worker and holds the run's plain data: `frames` (the untrimmed full run, kept for T-3.5 replay and `RunResult.frames`), a ring-buffered `log` capped at `LOG_LIMIT = 200` (the "ring buffer" of the acceptance — full event history stays recoverable from `frames[i].events`), `latestFrame` for live viz, a folded `aggregates` summary (latest p95/errorRate/servedRps, run peaks, bottleneck node id by highest util with graph-order tie-break), and `result` (verdict + frames on `done`). `run/pause/resume/stop/chaos` forward to the worker; a new `run` disposes the prior worker and resets state (replace semantics). No dropped frames because every `frame` message appends to `frames` synchronously.
- 2026-07-15 (T-4.4 planning): `Scorecard` (+ `RubricScore`/`Recommendation`/`PhaseScore`) is defined in the **`grading` engine** (`grading/rubric.ts`), not persistence — it is graded against the rubric the engine owns, mirroring `registry`→`ComponentDef`. M5's `RunBundle` will `import type { Scorecard } from "@/lib/grading"`. `runExportedAt` stays `""` until M5's export stamps it (keeps grading time-free and deterministic); the empty scorecard defaults to score 3 / `"hire"`. The localStorage key is `bp:scorecard:<id>`; `parseScorecard` is the forgiving import guard (fill-defaults, reject only non-object), mirroring `parseDesignRecord`.
- 2026-07-15 (T-5.2 planning): `RunBundle` + `buildRunBundle`/`parseRunBundle`/`exportRunBundleFile` live in `persistence/local.ts` (a persistence concern; reuses `parseDesignRecord`, `parseScenario`, `parseScorecard`). `parseRunBundle` returns a `{ ok, error }` result with a readable message per malformed section instead of throwing; a new private `parseRunResult` guard is **strict on `designSnapshot`** (registry kind check, an unknown kind would crash the replay canvas) but passes `frames` through **verbatim**, so an imported run replays byte-identically. Import UI is a review-screen `ImportDropzone` (file-picker + drag-drop) that persists the bundle's design+scorecard to localStorage, calls a new `sim-store.loadResult(result, scenario)` to rehydrate frames/aggregates/log (bundles are files, never localStorage — a cold reload of `/review/<id>` still shows no frames, matching T-4.5), then navigates to `/review/<design.id>`. Grader re-export: the review screen's `buildRunBundle` reads the live scorecard-store, so the exported bundle carries the grader's scores.
- 2026-07-15 (T-4.5 planning): the review screen lives at `/review/[runId]` with `runId === designId`, reading the in-session `design-store` / `sim-store` / `scorecard-store` (M4 "review right after your mock"; M5's exported `RunBundle` makes it durable across reloads). "Restore the graph snapshot at that moment" is served by an **in-memory** `actionSnapshots: DesignGraph[]` on `design-store` — one graph reference per recorded action, aligned to `actionLog`, captured in `recordAction`, reset on attach/import. Zero-copy (graphs are immutable), **never persisted**, not added to `DesignRecord` or `core.ActionEvent` (both frozen). A cold reload has no snapshots/frames → the timeline falls back to the final graph and the replay is hidden. The grader report exports as `<slug>.review.md` via a pure `buildReviewReport` (shell, `persistence/report.ts`).
