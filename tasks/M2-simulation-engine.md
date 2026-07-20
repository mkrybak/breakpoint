---
tags: [milestone]
status: active
milestone: M2
depends-on: M1
---

# M2 — Simulation engine

**Goal:** The heart of the product: `(graph, scenario, seed) → frames + verdict`, pure, deterministic, fully tested. Zero UI in this milestone — everything proven through tests.

**Demo:** `npm test` — all golden tests from [[03-simulation-engine#Test strategy]] pass; a script `npm run sim -- examples/twitter.json black-friday` prints the verdict and key frames to console.

## Tasks

### T-2.1 — Types + seeded RNG
- [x] T-2.1 done
  - Deviation: types live in `core/scenario.ts` + `core/sim-result.ts`, not
    `src/lib/simulation/types.ts` directly — `simulation` may only import `core`
    (never a future `scenarios` engine), and `Scenario`/`StressRule` must be
    reachable from both. `simulation/types.ts` re-exports them, mirroring
    `registry/types.ts`. Same pattern as the T-1.1/T-1.2 deviations.

**Files:** `src/lib/simulation/types.ts`, `rng.ts`
**Accept:** `SimFrame`, `RunResult`, `StressRule`, `Scenario` types per [[02-data-model]]; mulberry32 PRNG with test proving same seed → same sequence.

### T-2.2 — Traffic propagation
- [x] T-2.2 done
  - Deviation: none in file layout (`engine.ts` partial + `tests/engine.test.ts`).
    Traffic is a `{read, write}` Flow pair (golden 2 + T-2.3 db split need it);
    `propagateTraffic` takes a `serve` hook where T-2.3 plugs capacity; nothing
    re-exported from `simulation/index.ts` yet (public API grows at T-2.4/T-2.7).

**Files:** `src/lib/simulation/engine.ts` (partial)
**Accept:** Topo-sort from entry node; traffic flows along edges by `trafficShare`; cache split (hit stays / miss forwards); async edges route to queue semantics. Test: cache-in-front-of-DB golden case exact.

### T-2.3 — Node capacity/queue/drop model
- [x] T-2.3 done
  - Deviation: `configBoolean` added to `engine.ts` (beside `configNumber`)
    for db_sql's `sharded`; golden tests 1 & 3 proven at model level in
    `tests/node-models.test.ts` (no tick loop until T-2.4, which re-asserts
    them at frame level); the queue backlog crosses ticks as a `Flow`.

**Files:** `src/lib/simulation/node-models.ts`
**Accept:** demand/served/queued/dropped/util math per spec; effectiveCapacity honors replicas, read-vs-write split for db_sql, aliveFraction; state thresholds (ok/hot/saturated/overloaded/down) with transition events. Golden tests 1 and 3 pass.

### T-2.4 — Latency model + frame emission
- [x] T-2.4 done
  - Deviation: rules seam — `simulate(graph, scenario, applyRules?)` with
    `TickEffects { offeredRps, aliveFraction? }` (default: steady baseRps);
    goldens 3/4 drive the seam with hand-rolled hooks until T-2.5's rules.
    Per-node latencyMs computed in node-models (NodeModelOutput grew a
    field; one T-2.3 test updated); engine sums it along the sync path.
    Returns SimFrame[] — RunResult assembly waits for the verdict (T-2.6).

**Files:** `engine.ts` (complete tick loop)
**Accept:** M/M/1 latency along sync path + queue wait; p95 = 1.6×mean; `SimFrame` emitted per tick with perNode/perEdge/aggregates/events. Golden test 4 (spike drain) passes; determinism test 5 passes.

### T-2.5 — Stress rules
- [x] T-2.5 done
  - Deviation: rules compile via `compileRules(graph, scenario) → ApplyRulesFn`
    (the T-2.4 seam; single-run, stateful appliers). TickEffects grew
    `hitRate` + `deadEdges`; propagateTraffic books flow on dead edges as
    drops at the source, so partition shows in errorRate. hotkey = capacity
    multiplier min(1, 1/(skew × units)) on storage-category nodes;
    `loadShareUnits` added to node-models. Goldens 3/4 re-asserted through
    real rules in tests/rules.test.ts.

**Files:** `src/lib/simulation/rules.ts`
**Accept:** All six rules (ramp, spike, kill, flush, partition, hotkey) implemented per spec as a `ruleAppliers` registry map (see [[05-engines#Extension points (how the project grows without surgery)]] — adding rule #7 must touch only this file); kill uses seeded RNG; each rule has a unit test.

### T-2.6 — Verdict + consistency check
- [x] T-2.6 done
  - Deviation: RunResult reshaped — `verdict: Verdict { passed, failures:
    VerdictFailure[], advisories }` replaces the flat passed/failures
    (types in core/sim-result.ts; 02 updated). db_sql grew a
    `readYourWrites` boolean config (registry data) so the replica
    consistency failure is fixable, and `configSelect` joined engine.ts.
    minSurvivedKills acts as an on-switch: every kill must hold errorRate
    ≤ budget for 10s after firing. Premature-sharding advisory replays
    offered load through compileRules; verdict is evaluated post-hoc over
    frames, not incrementally.

**Files:** `src/lib/simulation/verdict.ts`
**Accept:** p95/error/kill-survival criteria evaluated over run; static strong-consistency path walk; advisory flags (over-provisioning, premature sharding, queue-on-sync-path). Tests for each criterion pass and fail correctly.

### T-2.7 — Web worker wrapper + sim CLI
- [x] T-2.7 done
  - Deviation: engine grew a stepping API — `createSimRun` with `simulate`
    = drained run — and rules a mutable `createRuleEngine` (`inject` = the
    chaos seam; compileRules wraps it). Worker split: `worker-host.ts`
    holds the testable protocol brain, `worker.ts` is the thin self-binding
    entry (not exported from index). `run.ts` adds
    `runSimulation`/`buildRunResult`. stop → done with partial frames;
    chaos re-anchors `at` to injection time; a new run replaces the active
    one. CLI runs via new dev dep tsx; demo inputs in `app/examples/`
    (scenario presets proper stay T-3.1).

**Files:** `src/lib/simulation/worker.ts`, `scripts/sim.ts`
**Accept:** Worker message protocol per spec (run/pause/resume/stop/chaos → frame/done); CLI script runs a graph+scenario headless and prints verdict — used for the demo and future CI.

## Decisions

-
