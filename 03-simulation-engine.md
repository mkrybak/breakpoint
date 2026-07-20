---
tags: [spec, simulation]
status: planning
---

# 03 — Simulation engine

Discrete-time flow simulation over the [[02-data-model|DesignGraph]]. Pure TypeScript, no dependencies, runs in a web worker at 10 ticks/s (dt = 100ms). Deterministic given `(graph, scenario, seed)` — same inputs always produce identical frames, which makes it unit-testable and replays exact.

## Tick loop

```
for each tick t:
  1. offeredRps = applyStressRules(scenario.timeline, t)   // ramp/spike modify load
  2. topo-sort graph from entryNode; propagate traffic along edges
     - each edge carries source.served * edge.trafficShare
     - cache nodes split traffic: hitRate stays, (1-hitRate) forwards downstream
     - async edges deliver to queues (absorb, delay), not to the sync latency path
  3. per node: demand = inbound + queued
     served  = min(demand, effectiveCapacity)
     queued  = clamp(demand - served, 0, maxQueue)      // maxQueue ≈ 0.5s of capacity
     dropped = demand - served - queued                  // load shedding
     util    = demand / effectiveCapacity
  4. latency: sum along sync path of  baseMs / (1 - min(util, 0.95))   // M/M/1 approx
     + queueWaitMs = queued / capacity * 1000
     p95 ≈ 1.6 × mean (good-enough approximation, documented)
  5. errorRate = Σ dropped / offeredRps
  6. emit SimFrame; evaluate verdict incrementally
```

### effectiveCapacity

```
base = def.capacity.rps (or writeRps for the write fraction)
× config.replicas          (if scaling: horizontal)
× aliveFraction            (kill rule marks instances down)
```

DB with read replicas: reads scale with replicas, writes stay at single-primary ceiling. Sharded DB (`config.sharded`): writes scale too, but verdict flags it if data volume estimate doesn't justify it (over-engineering hint — the "premature sharding" check).

### Node states

| util | state | visual |
|---|---|---|
| < 0.7 | ok | green bar |
| 0.7–0.9 | hot | amber |
| 0.9–1.0 | saturated | red |
| > 1.0 | overloaded | red pulse + queue counter |
| killed | down | gray, dashed border |

State transitions emit log events ("Postgres saturated at 8.2k TPS", "App-2 down — LB reroutes").

## Stress rules

| rule | effect |
|---|---|
| `ramp` | linearly interpolate offered RPS to `toRps` over `overSec` |
| `spike` | multiply offered RPS by `factor` for `forSec` |
| `kill` | mark `count` instances of `target` down (random via seeded RNG) |
| `flush` | cache hitRate → 0, recovers toward configured rate at ~1.5%/tick |
| `partition` | edges crossing the target become unavailable for `forSec` |
| `hotkey` | fraction `skew` of traffic routes to a single shard/instance — breaks "just shard it" answers |

## Consistency check (strong-consistency NFR)

Static graph analysis, not flow math: if `pass.consistency === "strong"`, walk every read path from entry to a data store. Fail if reads hit an eventually-consistent store (nosql default, read replica without `consistencyMode: "quorum"` or `readYourWrites` config) for entities that are also written. Report the offending path in the verdict.

## Verdict

Evaluated over the whole run:

- `p95Ms` — fail if p95 exceeds budget for > 5 consecutive seconds
- `maxErrorRate` — fail if exceeded at any tick after warmup (first 3s)
- `minSurvivedKills` — fail if any kill rule caused errorRate > budget (no redundancy)
- consistency — static check above
- **advisory flags** (don't fail, shown to grader): over-provisioning (>10× headroom everywhere), premature sharding, queue on a sync latency-critical path

Output: `passed: boolean`, `failures: [{criterion, atSec, detail}]`, `advisories: string[]`.

## Determinism & replay

- Single seeded PRNG (mulberry32) — used only by `kill` target selection and hotkey skew.
- No `Date.now()`, no `Math.random()` inside the engine.
- `RunResult.frames` is the full replay; the review screen scrubs through frames like a video.

## Worker interface

```ts
// main → worker
{ type: "run",   graph, scenario }        // full run, streams frames
{ type: "pause" } | { type: "resume" } | { type: "stop" }
{ type: "chaos", rule: StressRule }       // interviewer's live chaos button

// worker → main
{ type: "frame", frame: SimFrame }
{ type: "done",  result: RunResult }
```

## Test strategy

Golden tests in `tests/engine.test.ts`: tiny graphs with hand-computed expectations.

1. Single app server, 5k RPS offered, 4k capacity → served 4k, queue fills, drops begin at tick N (exact).
2. Cache 80% hit in front of DB: DB load = writes + 20% of reads (exact).
3. Kill 1 of 2 servers at t=5s → util doubles next tick.
4. Spike ×3 with queue → queue drains after spike, latency recovers.
5. Same seed twice → byte-identical frame arrays.

## Decisions

- 2026-07-12: M/M/1 approximation + p95 = 1.6×mean. Not academically rigorous — right shape, cheap, explainable. Documented in UI tooltip.
- 2026-07-13 (T-2.2 planning): propagation carries traffic as a `{read, write}` pair — cache/cdn absorb `hitRate × read` and pass writes through (write-through), which is what golden test 2 and db_sql's read-vs-write capacity (T-2.3) need. The split is registry-driven: any kind declaring a numeric `hitRate` configField splits; undeclared config keys are ignored (`configNumber` clamps to the field's range, defaults from the registry). Float-exact forms locked in: `write = total − read`, `missed = read − read × hitRate` — golden tests assert with `toEqual`, no epsilons.
- 2026-07-13 (T-2.2 planning): topo/cycle policy — order = Kahn over the subgraph reachable from the entry (both edge kinds), ties and cycle stalls broken by `graph.nodes` array order; self-loops, edges into the entry, and back edges carry zero traffic. The engine is total and deterministic on any input; *flagging* cycles/bad shares stays validation's job. Async-edge arrivals are booked separately (`asyncArrivals` vs sync `demand`) but forward downstream in the same pass — queue delay materializes as consumer-path latency (T-2.4), not a tick offset.
- 2026-07-13 (T-2.3 planning): capacity regimes — a def declaring `writeRps` gets independent read/write ceilings (`rps` is the *read* ceiling, per the "30k read / 15k write" table) with `util = max(read/readCap, write/writeCap)`; a def with only `rps` caps the total flow served proportionally (`util = total/cap`); omitted `rps` = unlimited, `util = 0`, Infinity never leaves node-models. Exact-total split everywhere (`write = total − read`, one-sided flows short-circuit) so golden tests stay `toEqual`-exact. All quantities in the spec's literal RPS units: the queue backlog is a `Flow` carried tick-to-tick, re-enters demand, clamps at `maxQueue = 0.5 × total capacity` — golden 1 drops start exactly on tick index 2.
- 2026-07-13 (T-2.3 planning): db_sql registers its own model in `modelByKind` — "Read replicas" counts replicas beyond the primary, so reads scale ×(1 + replicas) (generic ×replicas would zero out at the default 0) and writes hold the single-primary ceiling; `sharded: true` scales the write ceiling by the same (1 + replicas), each unit a full read-write shard. `aliveFraction` multiplies all ceilings; 0 short-circuits to zero capacity (guards `Infinity × 0 = NaN`) ⇒ maxQueue 0 ⇒ a down node sheds everything — no special case.
- 2026-07-13 (T-2.3 planning): state thresholds pinned half-open — `ok` < 0.7 ≤ `hot` < 0.9 ≤ `saturated` ≤ 1.0 < `overloaded`; `down` iff total effective capacity is 0. Transition log lines come from a `transitionMessage` map via `transitionEvent(label, to, servedRps)` (`formatRps`: 8200 → "8.2k"); the tick loop (T-2.4) emits on state change from an initial "ok".
- 2026-07-13 (T-2.4 planning): latency — per-node `latencyMs = baseMs / (1 − min(util, 0.95)) + queueWait` (`queued/totalCap × 1000`, ≤ 500ms by the maxQueue clamp) computed in node-models; the engine folds it along the sync path in reverse topo order with weight = edge flow / source's served total, so cache hits shorten the client path by exactly the traffic they absorb. Async edges are off the client path (queue delay shows in node metrics, not p95); down/unlimited nodes report plain baseMs (util 0). `p95 = 1.6 × mean` at the entry; p95Ms is 0 when the entry is missing.
- 2026-07-13 (T-2.4 planning): rules seam — `simulate(graph, scenario, applyRules?)` where `ApplyRulesFn(tickIndex, scenario, rng) → TickEffects { offeredRps, aliveFraction? }`, default steady `baseRps`; T-2.5 compiles the timeline into this hook (stateful appliers close over run state). `rng = mulberry32(scenario.seed)` is created inside `simulate`, so determinism is whole-run: same (graph, scenario, seed) ⇒ byte-identical frames (golden 5 asserts JSON.stringify equality). Ticks = round(durationSec × 10); frame `t = tick / 10` seconds.
- 2026-07-13 (T-2.5 planning): rule composition — `compileRules(graph, scenario)` compiles the timeline (stable-sorted by `at`) into per-run appliers evaluated every tick over a draft: ramps rewrite the baseline (each captures its start value lazily on its first active tick, so chained ramps interpolate from wherever the load actually is), spikes multiply (offered = baseline × factor), capacity fractions (kill, hotkey) compose by ×, flush overrides by min, dead edges by union. Windows are half-open tick ranges [at, at+for) with secToTick = round(sec × 10). The hook is single-run — compile fresh per simulate() call.
- 2026-07-13 (T-2.5 planning): kill — fires once at its tick: victims drawn without replacement by the run RNG from the flattened pool of (matched node × loadShareUnits) slots; node id match beats kind match; each hit node's aliveFraction = survivors/units, permanent for the run. `loadShareUnits` (node-models, beside dbSqlCapacity): db_sql 1 + read replicas, horizontal kinds = replicas, else 1.
- 2026-07-13 (T-2.5 planning): flush — stateless: override = 0.015 × ticksSinceFlush per cache-kind node, dropped once it reaches the configured hitRate (~53 ticks for 0.8). Carried as `TickEffects.hitRate` (node id → forced rate); propagateTraffic prefers it over config.
- 2026-07-13 (T-2.5 planning): partition — dead edges = every edge touching a matched node, carried as `TickEffects.deadEdges`. A dead edge carries zero (also vanishing from the latency path, whose weights are flow-derived) and its would-be flow books as `PropagationResult.unroutable` at the source, counted into that node's frame `dropped` and errorRate — a partitioned backend shows as errors, not silence. topoSort ignores partitions.
- 2026-07-13 (T-2.5 planning): hotkey — load-imbalance model: skew fraction s of traffic hits one of u load-share units, the hot unit saturates at unitCap, sustainable total = unitCap/s ⇒ capacity multiplier min(1, 1/(s × u)), storage-category nodes only (stateless compute rebalances; sharded db_sql scales u up and the multiplier takes the win right back — "just shard it" breaks). Composes with kill via the aliveFraction product; no per-unit queue modeling.
- 2026-07-13 (T-2.4 planning): frame aggregates — `errorRate = min(1, Σdropped / offered)` (offered 0 ⇒ 1 if anything dropped, else 0); `servedRps = max(0, offered − Σdropped)`, i.e. accepted-not-dropped (queued work counts until it drops), pinned to 0 when no entry node exists; events emitted in graph.nodes order from a per-run prevState map initialized "ok"; nodes propagation never reaches are still evaluated with zero inflow each tick so stranded backlogs drain/drop instead of freezing.
- 2026-07-13 (T-2.6 planning): verdict — evaluated post-hoc by `evaluateVerdict(graph, scenario, frames)` over the finished frame array (equivalent to the tick loop's "incrementally", pure, and the p95 streak needs whole-run view anyway); criteria and advisors are registry lists in verdict.ts (new check = push a Criterion). p95 fails when strictly over budget for MORE than 50 consecutive ticks (fires on the 51st), reported at the streak's first frame, first streak only, no warmup exemption; error-rate fails on the first frame index ≥ 30 (t ≥ 3s) over maxErrorRate.
- 2026-07-13 (T-2.6 planning): kill-survival — active iff minSurvivedKills ≥ 1; every kill rule must keep errorRate ≤ maxErrorRate through the half-open 100-tick (10s) window after its fire tick, one failure per broken kill. The count beyond presence is unused (03's own wording: "any kill rule"); it also catches breaches inside the 3s warmup, and a post-warmup breach double-reports under both labels by design.
- 2026-07-13 (T-2.6 planning): consistency walk — BFS over sync edges from the entry (async edges are off the read path, matching the latency model), first-found parents give the reported path. Offenders per-kind via the `eventualReadReasons` map: db_nosql unless consistencyMode ∈ {quorum, strong}; db_sql iff read replicas ≥ 1 without the new `readYourWrites` boolean. Cache/CDN/search/blob excluded — the check targets the system of record, not copies/derived indexes. "Entities that are also written" approximated by reachability (the write fraction follows the same edges).
- 2026-07-13 (T-2.6 planning): advisories — over-provisioning: every node whose def declares capacity.rps stays under util 0.1 in every frame (≥ 1 such node required; unlimited kinds excluded — they always read util 0). Premature sharding: sharded db_sql where peak offered write load (offered series replayed via compileRules × (1 − readRatio)) fits the single-primary writeRps — a topology-free upper bound, conservatively silent when unsure. Queue-on-sync-path: any category-"async" node the sync BFS reaches.
- 2026-07-14 (T-2.7 planning): stepping seam — `createSimRun(graph, scenario, applyRules?) → { tick(): SimFrame | null }` is the tick loop's incremental form (per-run state in the closure); `simulate` drains it, so golden 5's byte-identity pins the refactor. The worker paces `tick()` with `setInterval(…, 100)` — real time at 10 ticks/s; wall-clock never enters frame math.
- 2026-07-14 (T-2.7 planning): worker protocol — implemented as specced (run/pause/resume/stop/chaos → frame/done) in `worker-host.ts`, a pure factory `createWorkerHost(post)` tests drive directly; `worker.ts` is the entry binding it to the worker globals (never exported from index.ts). Semantics pinned: `stop` posts `done` with the verdict over the frames so far (one completion path); a `run` while active replaces it silently (no `done` for the abandoned run); messages without an active run are ignored; a zero-duration run posts `done` immediately.
- 2026-07-14 (T-2.7 planning): chaos — `createRuleEngine(graph, scenario) → { apply, inject }` (compileRules = its `apply`); `inject` compiles one rule through the same `ruleAppliers` registry and appends it, which composes correctly (append order only matters to ramps, which interpolate from whatever earlier appliers left). The host re-anchors the injected rule's `at` to the current sim time (frames completed ÷ 10), so it — and its `[at, at+for)` window — fires on the very next tick.
- 2026-07-14 (T-2.7 planning): headless runs — `runSimulation(graph, scenario) → RunResult` (compile + simulate + verdict, in run.ts; `buildRunResult` shared with the worker) is the CLI/CI entry. CLI `npm run sim -- <graph.json> <scenario>`: a `<scenario>` not ending in .json resolves to `<name>.json` beside the graph file; prints one row per second + event lines + verdict; exit 0 pass / 1 fail / 2 usage. Runs under tsx (dev dep — Node can't resolve the `@/*` alias). Demo inputs in `app/examples/` (twitter.json, black-friday.json); scenario presets proper stay T-3.1.
- 2026-07-14 (T-3.2 planning): the browser spawns the worker through a new engine helper `createSimWorker(onMessage): SimWorkerHandle` in `simulation/client.ts` — the sole home of `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` (Turbopack's supported static form), exported from `index.ts`. Kept in the engine (not the store) so the `worker.ts` reference is simulation-internal and no dep-cruiser deep-import rule is tripped; `worker.ts`'s *value* is still never exported. The shell store `sim-store.ts` holds the `SimWorkerHandle` outside zustand state and injects a fake factory (`createWorkerHost` on fake timers) under vitest, where `Worker` is undefined.
