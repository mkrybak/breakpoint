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
  1b. breakers (T-8.6): each sync edge with a breaker gates this tick's calls — closed 1, open 0, half-open 0.1 (one probe tick); an open breaker that finished its cooldown turns half-open first
  2. topo-sort graph from entryNode; propagate traffic along edges
     - each edge carries forwarded × edgeMultiplier: trafficShare on an lb's split edges (Σ = 1), callsPerRequest on every other (call) edge (default 1; 0.2 = 20% of requests; 3 = three calls)
     - cache nodes split traffic: hitRate stays, (1-hitRate) forwards downstream
     - async edges deliver to queues (absorb, delay), not to the sync latency path
     - the gated-off share of an edge's calls (fresh + retries) never reaches the target: booked as unroutable at the caller (fails fast, client error), schedules no retry
  3. per node: demand = inbound + queued
     served  = min(demand, effectiveCapacity)
     queued  = clamp(demand - served, 0, maxQueue)      // maxQueue ≈ 0.5s of capacity
     dropped = demand - served - queued                  // load shedding
     util    = demand / effectiveCapacity
     async nodes (queue, stream): served = min(demand, capacity, consumers' pull); backlog ≤ retentionMsgs; see "Async nodes"
  4. latency (mean and variance, reverse topo order over the reachable nodes):
       nodeMs(n)  = baseMs / (1 - min(util, 0.95))   // M/M/1 approx
                    + queueWaitMs = queued / capacity * 1000   // async nodes add no queue wait (it shows as lagSec)
       pathMs(n)  = nodeMs(n) + Σ over n's forward sync edges e→m of weight(e) × pathMs(m)
         call  (non-LB source): weight = flow(e) / served(n)        // = callsPerRequest × pass-through; calls ADD
         split (LB source):     weight = flow(e) / Σ flow(n's sync edges)  // backends AVERAGE
       async edges are off the client path; dead (partitioned) edges carry 0 → weight 0
       edges leaving an async node are off the client path: consumers pull   // a queue's path latency = its enqueue cost
       mean = pathMs(entry)
       varNode(n) = (baseMs / (1 - min(util, 0.95)))²   // M/M/1 time is exponential; queue wait is a fixed shift
       varPath(n) = varNode(n) + over n's forward sync edges e→m (w = weight(e), m/v = pathMs/varPath of the target):
         call:  Σ [ w·v + f(1−f)·m² ]   (f = w − ⌊w⌋: ⌊w⌋ or ⌈w⌉ calls)
         split: Σ w·(v + m²) − (Σ w·m)²  // mixture
         (policy edges: m' = termMs(m), v' = v·(m'/m)², a scale/cap — see "Timeouts & retries")
       p95 = pathMs(entry) + 2·√varPath(entry)   // one exponential hop: 3.0 × mean ≈ ln 20
  4b. policy edges (sync calls with timeoutMs/retries): timeouts + retry carry, see "Timeouts & retries"; retried drops leave errorRate, given-up timeouts join it.
  5. errorRate = Σ client-path dropped / offeredRps
     client share per node: entry 1, async nodes 0, else sync-carried in-flow fraction. The rest of each node's drops → asyncDroppedRps; maxLagSec = max async-node consumer lag
  5b. breakers fold this tick's edge failure rate (failed ÷ admitted calls, T-8.5): closed → open after N consecutive ticks strictly over threshold; half-open → open if over, else closed
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

## Async nodes (queue, stream)

Async-category kinds use `bufferModel` (`node-models.ts`) instead of the 0.5s-of-capacity cap.

- **Pull.** A queue serves `min(demand, ownCap, drainRps)`. `drainRps` = min over its forward outbound edges of `headroom(consumer) ÷ edgeMultiplier(edge)` (the edge's callsPerRequest — a queue's outbound edges are always calls, T-8.3); headroom = the consumer's effective capacity this tick (`capacityByKind`, with its aliveFraction) minus its own carried backlog, floored at 0 (an async consumer counts zero backlog). Workers therefore run saturated, never overloaded, behind a queue.
- **Retention + units.** Backlog is carried in RPS units like every node (a carried Q re-enters as Q RPS for one tick = Q ÷ 10 messages), so `queueDepth = queued ÷ 10` and the cap is `retentionMsgs × 10` (config, default 1M messages). Backlog beyond it drops (counted in `asyncDroppedRps`, not errorRate — T-8.2). A down queue retains nothing.
- **Util/state.** `util = max(inflow ÷ ownCap, overflow ÷ retentionCap)`: a filling buffer goes hot at 70%, saturated at 90%, overloaded exactly when it sheds.
- **Latency** is the enqueue cost only, `baseMs / (1 − min(ingestUtil, 0.95))`; backlog wait is consumer lag, not producer latency.
- **Lag.** `lagSec = queueDepth ÷ drainedRps` while consumers drain; 0 with no backlog; a backlog nobody drains ages one tick per tick (`prevLag + 0.1`).
- **Edge cases.** A sink queue (no forward consumer edge) drains without limit. A partitioned consumer edge sets `drainRps = 0` — the backlog holds instead of dropping.
- **Frame.** `queueDepth` and `lagSec` appear on async-category nodes only.

## Timeouts & retries

A *policy edge* is a sync edge whose source is not async-category and that has `timeoutMs > 0` or `retries ≥ 1`, or a circuit breaker (then `{ retries: 0 }`, so it reports `failRate`; T-8.6) (engine-sanitized: retries rounded, 0–5; timeout ≤ 60000 ms; non-finite = absent). Per-edge state lives in `edge-state.ts` and is carried tick to tick. Every other edge takes no new code path, so graphs without policy edges produce byte-identical frames.

```
attempts   = fresh + Σ retryCarry                      // retries ride the edge, not the source's capacity
reject     = min(1, dropped(T) / arrivals(T))           // tail-drop
timedOut   = timeoutMs ? exp(−timeoutMs / pathMs(T)) : 0 // exponential M/M/1 tail
fail       = reject + (1 − reject) × timedOut
retryCarry' = [fresh, carry0, …, carry(R−2)] × fail
exhausted  = (R = 0 ? fresh : carry(R−1)) × fail        // client-visible
errors    += (exhausted − attempts × reject) × clientShare(source)
```

Timed-out work still loads the target: it served or queued it, and only the caller stopped waiting. A dead (partitioned) edge books fresh + retry flow as unroutable at the source and resets its carry. The latency term is `attempts/fresh × m(1 − e^(−t/m))` (`termMs`, with weights from fresh flows), with no backoff: the retry goes next tick, to the same target. Frames: `perEdge[id]` gains `retryRps` and `failRate` on policy edges only.

## Stress rules

| rule | effect |
|---|---|
| `ramp` | linearly interpolate offered RPS to `toRps` over `overSec` |
| `spike` | multiply offered RPS by `factor` for `forSec` |
| `kill` | mark `count` instances of `target` down (random via seeded RNG) |
| `flush` | cache hitRate → 0, recovers toward configured rate at ~1.5%/tick |
| `partition` | edges crossing the target become unavailable for `forSec` |
| `hotkey` | fraction `skew` of traffic routes to a single shard/instance — breaks "just shard it" answers |

## Circuit breaker (T-8.6)

An optional `DesignEdge.breaker` on a sync edge whose source is not a queue/stream (async edges ignore it). Settings are in seconds; the engine resolves them to ticks (`max(1, round(sec × 10))`) and clamps to `BREAKER_LIMITS` (threshold 5–95%, trip window 0.1–10 s, cooldown 0.5–60 s). State machine: `simulation/breaker.ts`; per-run state: the `breakers` map in `createSimRun`.

| phase | admits | leaves when |
|---|---|---|
| closed | all calls | the edge's call failure rate is strictly above the threshold for `tripTicks` consecutive ticks → open (a zero-attempt tick resets the streak) |
| open | none: calls fail fast at the caller (unroutable → client error), no target load, no retries | `cooldownTicks` open ticks completed → half-open at the start of the next tick |
| half-open | `BREAKER_PROBE_FRACTION` = 10% for exactly one tick (the other 90% fail fast) | end of that tick: failure rate over threshold → open (cooldown restarts), else closed |

The failure rate is T-8.5's per-edge `failRate` (shed by the target + timed out, over *admitted* calls only), so a slow target trips it even without drops, and a partitioned edge (failRate 1) trips it too. Defaults (`DEFAULT_BREAKER`): open at 50% errors · 0.5 s trip window · 5 s cooldown; probe 10% for one tick. Latency needs no change: T-8.4's weights come from fresh flow, which is gated too, so an open edge adds 0 ms and a half-open one 10%. An LB edge's open breaker rejects its own share; there is no rerouting.

Log lines (after node transitions, in `graph.edges` order, half-open before open/closed within an edge):
- `{Source} → {Target} breaker open at {pct}% errors — failing fast` (warning)
- `{Source} → {Target} breaker half-open — probing` (info)
- `{Source} → {Target} breaker closed — traffic restored` (recovered)

Frames: `perEdge[id].breaker` = the phase that governed that tick's traffic (so it always matches the frame's `rps`), only on breaker edges. The tick that trips still reads `closed` and carries the "open" line. `failedFastRps` = RPS the breaker rejected at the caller that tick, only on breaker edges on open/half-open ticks (T-12.1).

## Consistency check (strong-consistency NFR)

Static graph analysis, not flow math: if `pass.consistency === "strong"`, walk every read path from entry to a data store. Fail if reads hit an eventually-consistent store (nosql default, read replica without `consistencyMode: "quorum"` or `readYourWrites` config) for entities that are also written. Report the offending path in the verdict.

## Verdict

Evaluated over the whole run:

- `p95Ms` — fail if p95 exceeds budget for > 5 consecutive seconds
- `maxErrorRate` — fail if exceeded at any tick after warmup (first 3s)
- `minSurvivedKills` — fail if any kill rule caused errorRate > budget (no redundancy)
- consistency — static check above
- `maxLagSec` (optional) — fail on the first tick where max consumer lag exceeds it
- **advisory flags** (don't fail, shown to grader): over-provisioning (>10× headroom everywhere), premature sharding, queue on a sync latency-critical path, async work lost (Σ asyncDroppedRps > 0)

Output: `passed: boolean`, `failures: [{criterion, atSec, detail}]`, `advisories: string[]`, `breakerTrips?: [{edgeId, sourceLabel, targetId, targetLabel, failedFast, recoveredAtSec}]` (breakers on the client's sync path that failed calls fast; present only when non-empty).

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
6. Queue in front of workers (app ×5 → queue → workers ×2), 1500 RPS, ×3 spike for 3s → 0 errors, depth peaks 7500 msgs / lag 3.75s at t=7.9s, drains to 0 by t=22.9s.
7. T-8.2 client vs async drops + latency: client → app → queue → worker (sync edges, worker saturated) → p95 = mean + 2σ over (client + app + queue enqueue), no worker term; an async edge into an overloaded worker → errorRate 0, all worker drops in `asyncDroppedRps`; a sink shared by a sync caller and a queue's workers splits its drops by client share (half → errorRate, half → async); queue retention overflow → errorRate 0, `asyncDroppedRps` > 0; frame `maxLagSec` = per-node max `lagSec`.
8. App calling a cache then a DB (two sync calls) pays both; an LB split over two backends averages them, and a partitioned backend leaves the live one charged in full.
9. Retry storm: a 1 s ×2 spike on a dependency with timeout 200 ms + retries 3 settles at ~3.4× load and ~65% errors for the rest of the run; without retries it recovers 0.3 s after the spike.
10. Breaker under a dependency outage: open at tick 14, probe fails at 65, probe closes at 116 (exact); the retry storm recovers with the breaker on.
11. LB split = mixture: unequal branches widen p95, not the mean.

## Decisions

- 2026-07-12: M/M/1 approximation + p95 = 1.6×mean. Not academically rigorous — right shape, cheap, explainable. Documented in UI tooltip. (superseded 2026-11-06 by T-8.7: mean + 2σ)
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
- 2026-11-06 (T-8.1 planning): queues buffer. Async-category nodes get `bufferModel` (pull semantics, see "Async nodes"); the 0.5s `maxQueue` (T-2.3) now applies only to non-async nodes, and T-2.2's "forward in the same pass" still holds for whatever the consumers pull. Calls: (1) retention is size-based (`retentionMsgs`, default 1M, 1000–1e8, step 1000), not time-based — runs last ~60s, so a time retention could never trigger; (2) a sink queue (no consumer edge) drains without limit, a partitioned consumer edge pauses the drain (nobody pulls over a cut link); (3) new per-kind `capacityByKind` (db_sql) beside `modelByKind`, because pull headroom needs a consumer's capacity before it is evaluated; `getNodeModel` falls back to `bufferModel` by category "async", so a future async kind buffers with no map entry; (4) `queueDepth`/`lagSec` are optional `SimFrame` fields present only on async nodes — graphs without queues produce byte-identical frames, old fixtures and bundles stay valid. The engine test "keeps async subtrees off the client latency path" changed: its worker was overloaded with 25% errors; now the queue holds the excess, the worker is saturated and errorRate is 0 — exactly the behaviour this task fixes.
- 2026-11-06 (T-8.2 planning): client vs async drops. (1) "Sync (client) path" is a per-node, per-tick fraction: `clientShare(entry) = 1`, `clientShare(async-category) = 0`, others = Σ over in-edges of flow × (sync ? source share : 0) ÷ total in-flow; a node with zero inflow this tick keeps last tick's share (initially 0) so draining backlog stays attributed. Each node's drops (model drops + unroutable) split × share into errorRate and × (1 − share) into `asyncDroppedRps`; carried backlog is attributed by this tick's mix (exact for 0 and 1). (2) Flow stranded on a dead edge is charged by its *source's* share whatever the edge kind — a producer that can't enqueue fails the request; only work a queue accepted is async. (3) `servedRps = max(0, offered − clientDropped)` — client-facing. (4) Async losses are an advisory ("Async work lost: N jobs dropped after being queued …"), never a failure (user call); async health fails a run only via the optional `pass.maxLagSec`. (5) Lag criterion `"lag"`: first frame with `maxLagSec > budget` (strict), no warmup, first breach only. (6, lead review) Edges leaving an async node are off the client path: consumers pull — `meanPathMs` stops at async nodes whatever the outbound edge kind, so a queue's path latency is its enqueue cost (before: client → app → queue → saturated worker over sync edges showed p95 ≈ 660 ms from the worker's backlog wait). No existing p95 assertion changed; new golden "stops the client path at a queue". HUD: Practice full bar gets a "Lag" card after Errors (current max lag, sub `peak X s` + ` · N lost`), Quick gets a "Queue lag" card after Errors; both render only when the run graph (or the idle design) has a queue/stream. Requirements panel gets an optional "Max consumer lag (s)" field (empty = no limit). Per-node `dropped` stays the node's total (canvas viz unchanged); the canvas backlog badge shows `queueDepth` (messages) on async nodes, amber unless overloaded.
- 2026-11-06 (T-8.3 planning): split vs call edges. Whether an edge splits or calls is decided by `registry.isSplitSource(sourceKind)` (`ComponentDef.splitsTraffic`, lb only). `edgeMultiplier(edge, sourceKind)` (engine.ts, not on the public index) is the single edge → number seam: split → `trafficShare ?? 1`, call → `callsPerRequest ?? 1`; `propagateTraffic` and the queue pull headroom both go through it. Propagation is the same math (both multiply the forwarded flow), so no golden number changed. The engine never reads legacy fields — a call edge's `trafficShare` is ignored; migrating old files is the persistence guard's job (`parseDesignGraph`, which the CLI also uses). Latency is still flow-weighted (`meanPathMs`); T-8.4 replaces it with a callsPerRequest-weighted sum on call edges and keeps the average on split edges.
- 2026-11-06 (T-8.4 planning): client-path latency — `clientPathTerms` (weights) + `meanPathMs` (fold) in engine.ts, separate so tail models (T-8.7) reuse the weights. Call edges (non-LB source) weigh flow(e)/served(source) = callsPerRequest × pass-through, so sequential calls sum and a cache's DB call charges only misses + writes (weights are flow-derived, never read from callsPerRequest, so hits never pay the DB). The pre-M8 fold was already this sum; it read as an average only because sum-to-1 shares halved fan-outs. LB splits are now a normalized flow-weighted average (denominator = Σ flow on the LB's sync forward edges, not served(lb)), so a partitioned backend no longer halves the path (2-backend LB, one cut: p95 11.77 → 20.30 ms; its share still errors via unroutable). Calls are sequential (cpr 3 = 3× the callee path); parallel fan-out (max) is not modelled. Dead edges weigh 0, async edges stay off the path, float fold order unchanged, so no existing golden changes value.
- 2026-11-06 (T-8.5 planning): timeouts and retries on sync call edges (not edges out of a queue/stream: consumers pull). An attempt fails when the target sheds it (tail-drop: `rejectFraction = min(1, dropped / arrivals)`, a full queue rejects new arrivals first) or when it outlasts the timeout, as a *fraction* `exp(−timeoutMs / pathMs(target))` — M/M/1 time-in-system is exponential, so this is `P(T > t)`; an all-or-nothing cliff (`pathMs > timeout ⇒ 100%`) would flip on a 1 ms config change and hide the realistic trickle of timeouts a tight timeout causes on a healthy service, which is what retries are for. Failed attempts with a retry left are re-offered to the same target next tick on top of fresh traffic, with no backoff; timed-out work still loads the target. Only exhausted attempts are client-visible: each policy edge adds `exhausted − rejected` to the T-8.2 split (× source client share), both tallies floored at 0; dead edges book everything unroutable and reset the carry. Latency per term = attempts × `E[min(T, t)]` (`termMs`, the single per-term transform T-8.7 scales/caps), with T-8.4's weights now from fresh flows so retries don't change their meaning. Frames: `perEdge` `retryRps`/`failRate` only on policy edges. Seam: `edge-state.ts` (EdgePolicy/EdgeState/stepEdge); T-8.6 adds the breaker fields there.
- 2026-11-06 (T-8.6 planning): circuit breaker — per sync edge, optional (`DesignEdge.breaker`, seconds; engine resolves to ticks, clamps to BREAKER_LIMITS). Trips on the edge's own call failure rate (drops at target + timeouts, over admitted calls only — a client-side breaker, so a slow target trips it without dropping), strictly > threshold for tripTicks consecutive ticks; zero-attempt ticks reset the streak. Open = edgePass 0: calls book as unroutable at the caller (partition path → client errorRate), no target load, no retries scheduled. After cooldownTicks open ticks it half-opens for exactly one tick admitting BREAKER_PROBE_FRACTION 0.1 (the other 90% fail fast); the probe's failure rate decides closed vs re-open (cooldown restarts) at the end of that tick. Latency needs no change (T-8.4 weights are flow-derived: open adds 0 ms). Events after node transitions, graph.edges order, half-open before open/closed. LB edges reject their share, no rerouting. Async edges ignore it.
- 2026-11-07 (T-8.6 build): the breaker state machine lives in `breaker.ts` and its per-run state in `createSimRun`'s `breakers` map, not in `edge-state.ts` as T-8.5's entry anticipated. A breaker-only edge becomes a policy edge `{ retries: 0 }` so `stepEdge` reports its `failRate`; edges out of a queue/stream get no breaker (same `edgeSupportsResilience` rule as timeouts/retries). `stepEdge` takes `admit` and scales the retry carry by it, so rejected retries schedule nothing.
- 2026-11-06 (T-8.7 planning): p95 = mean + 2σ of the client path. Each node reports its latency variance next to its mean (`latencyVarMs2`): the M/M/1 part is exponential, so variance = its mean²; the backlog wait (and any other fixed term) is a shift with variance 0. The engine folds both moments in the same reverse-topo pass as the mean (`pathMomentsMap`; the mean is T-8.5's fold term for term): sequential calls add means and variances, a fractional call weight w is ⌊w⌋ or ⌈w⌉ calls (+ f(1−f)·m²), an LB split is a mixture (Σw(v+m²) − (Σwm)²), and a policy edge's `termMs` transform scales the spread with the mean (v' = v·(m'/m)²). Why: a utilization-dependent factor can't say whose util to use and misses mixtures (a cache whose 20% misses are slow really has a p95 near the miss latency); summing per-node p95s overstates a sum's tail and averaging them understates a mixture's. Moments compose exactly for sums and mixtures, and mean + 2σ reproduces one exponential hop's p95 (3.0 × mean vs ln 20 ≈ 2.996), is within ~2% of Erlang-n, and gives 50.0 ms for an 80% × 1 ms / 20% × 50 ms mixture (true 50). The old 1.6 × mean understated the tail. HUD: the p95 card's label is dotted-underlined with a one-sentence native tooltip (`P95_HINT`), both HUDs. Goldens (old → new, ms): spike drain frame 0 27.20 → 49.06, frame 6 1057.60 → 981.01 (the 500 ms backlog is no longer ×1.6), frame 10 257.60 → 481.01; cache miss share 6.66 → 13.51; app → cache → DB sequential 37.40 → 57.24; fractional 0.2 DB call 30.45 → 51.73; LB over identical backends and LB with a partitioned backend 20.30 → 34.21; dead call and async subtree 27.20 → 49.06; client path stopping at a queue 28.49 → 44.71; 100 ms timeout cap 27.15 → 48.97; new LB mixture golden 42.15. Measured peak p95 (scenario × design, budget): starter × starter 30.4 → 46.7 (200, starter headroom test still < 100); quick-spike-3x × 2 replicas 39.9 → 63.3; quick-lose-app-server × 3 replicas 45.0 → 72.3; quick-black-friday × 3 / 4 replicas 270.1 → 489.2 FAIL / 65.3 → 106.7 PASS (250); quick-celebrity-tweet × 4 / 5 replicas 221.6 → 395.2 FAIL / 68.0 → 109.3 PASS; CDN designs ≈ 31 → ≈ 57 PASS; overloaded nodes ≈ 1066 → ≈ 987. The only verdict flip was black-friday × `examples/twitter.json` (8 app replicas): 213.3 → 389.5 ms at util 0.94, PASS → FAIL. Call: keep the shared Practice preset's 250 ms budget and give the example 9 app replicas (util 0.83 at the peak, p95 149.8 → PASS) — the lesson is "leave headroom at the peak"; retuning a shared preset to fit one example would not be honest. (Black-friday / celebrity-tweet × CDN were already FAIL on errors and now also breach p95: peak 228.0 → 684.1 / 180.0 → 597.7.)
- 2026-11-07 (T-12.1 planning): breaker facts for the verdict come from frames. Frames couldn't say how much a breaker failed fast (open `rps` is 0 and the rejected flow sits in the source's `dropped`, mixed with its own drops and partitions), so `EdgeFrame.failedFastRps?` reports it — reporting only, no numbers or events change. `BreakerTrip.failedFast` = Σ failedFastRps ÷ TICKS_PER_SEC (includes half-open's 90% and rejected retries; = requests when callsPerRequest is 1), counted only for breakers whose source is sync-reachable from the entry (a breaker behind a queue doesn't feed errorRate). `recoveredAtSec` = `t` of the first frame of the run's final unbroken `closed` stretch (a close followed by a re-open doesn't count), null when the last frame isn't closed.
