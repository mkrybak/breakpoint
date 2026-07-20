---
tags: [milestone]
status: planning
milestone: M3
depends-on: M2
---

# M3 — Stress scenarios & realtime visualization

**Goal:** The "wow" moment: press Run and watch the design cope or collapse in realtime — utilization bars, animated traffic edges, event log, verdict.

**Demo:** Load Twitter example, run "Black Friday" scenario: traffic ramps, nodes go green→amber→red, Postgres queues then sheds load, verdict fails with exact reason; add a cache and replicas, re-run, verdict passes.

## Tasks

### T-3.1 — Scenario presets + requirements panel
- [x] T-3.1 done
  - Deviation: presets load via a hand-rolled `parseScenario` guard in
    scenarios/index.ts (+ `SCENARIO_PRESETS`, `listScenarioPresets`,
    `getScenarioPreset`, and pure `describeStressRule`), not `as` casts —
    JSON widens the rule discriminant to string. Interviewer edits live in a
    new `scenario-store.ts` (working Scenario = `structuredClone` of the
    selected preset; strong-consistency toggle adds/removes `pass.consistency`).
    ScenarioPanel + RequirementsPanel render in a new right rail in the design
    page; NodeConfigPanel is untouched. Functional style reuses NodeConfigPanel's
    tokens — a /ui polish pass can follow. sim-store wiring stays T-3.2.

**Files:** `src/lib/scenarios/presets/*.json`, `src/components/panels/RequirementsPanel.tsx`, `ScenarioPanel.tsx`
**Accept:** 3 presets: `black-friday` (ramp+spike), `celebrity-tweet` (hotkey+spike), `az-outage` (kill+partition); RequirementsPanel edits `pass` criteria (RPS, p95, error budget, consistency toggle); ScenarioPanel picks preset, shows timeline preview.

### T-3.2 — Wire worker to sim store
- [x] T-3.2 done
  - Deviation: the real worker is spawned by a new engine helper
    `createSimWorker` in `src/lib/simulation/client.ts` (the only home of the
    `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`
    pattern), exported from `@/lib/simulation` — keeping the `worker.ts`
    reference simulation-internal so no deep cross-engine import leaves the
    shell. `sim-store.ts` owns the worker via a module-level handle and a
    `setSimWorkerFactory` test seam (tests drive `createWorkerHost` on fake
    timers). "Ring buffer" = the event `log` (capped at LOG_LIMIT 200); `frames`
    is the untrimmed full run for replay. Store exposes `latestFrame` +
    a folded `aggregates` (latest p95/err/served, run peaks, bottleneck node).
    No UI wires it yet — Run button + readers are T-3.3/T-3.4/T-3.5.

**Files:** `src/stores/sim-store.ts`
**Accept:** Run/pause/stop actions; frames stream into store (ring buffer, keep full run for replay); store exposes latest frame + derived aggregates; no dropped frames at 10Hz with 50-node graph.

### T-3.3 — Live node & edge visualization
- [x] T-3.3 done
  - Deviation: the plan's `formatCount` test asserted `formatCount(1250) ===
    "1.2k"`, but `(1250 / 1000).toFixed(1)` (as specified in the plan's own
    `sim-visuals.ts`) evaluates to `"1.3k"` in V8 — 1.25 is exactly
    representable in binary and V8 rounds it up, not down. Corrected the test
    assertion to `"1.3k"`; `formatCount` itself is unchanged from the plan.

**Files:** `ComponentNode.tsx`, `FlowEdge.tsx` (extend)
**Accept:** Nodes show live utilization bar + state color + queue badge; killed nodes gray/dashed; edges animate (dash offset speed ∝ RPS, width ∝ traffic); 60fps render with 10Hz data (interpolate or memo).

### T-3.4 — HUD: metrics, event log, verdict
- [x] T-3.4 done
  - Note: implemented exactly as planned, no deviations. T-3.1's files
    (scenario-store.ts, ScenarioPanel.tsx, RequirementsPanel.tsx, presets)
    were found uncommitted in the working tree from an earlier session —
    left untouched and excluded from this task's commit.

**Files:** `src/components/hud/MetricsBar.tsx`, `EventLog.tsx`, `Verdict.tsx`
**Accept:** Metric cards (p95, error rate, served RPS, bottleneck node) update live; event log streams with severity colors; verdict banner: live status while running, final pass/fail with failure list after.

### T-3.5 — Chaos buttons + replay scrubber
- [x] T-3.5 done
  - Deviation: the plan's `ReplayScrubber` reset `playing` to `false` via a
    bare `useEffect` keyed on `status`, which fails lint —
    `react-hooks/set-state-in-effect` (from `eslint-config-next/core-web-vitals`)
    flags synchronous setState in an effect with no external system involved.
    Fixed by adjusting `playing` during render against a tracked `prevStatus`
    instead, per React's "you might not need an effect" guidance; behavior
    unchanged. `plans/T-3.5.md` updated with the same correction.

**Files:** `ScenarioPanel.tsx` (extend), `src/components/hud/ReplayScrubber.tsx`
**Accept:** Live chaos: kill random server, flush cache, spike ×3 — injected into running sim via worker `chaos` message and logged; after run, scrubber replays frames over the canvas like a video.

## Decisions

-
