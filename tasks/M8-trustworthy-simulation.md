---
tags: [milestone]
status: active
milestone: M8
depends-on: M7
---

# M8 — Trustworthy simulation

**Goal:** Fix the places where the sim punishes correct designs or flatters wrong ones, so someone who knows systems can't easily poke holes in it.

**Demo:** A queue in front of workers absorbs a 3× burst with zero client errors and a visible lag that drains. An app server fanning out to a cache *and* a queue no longer trips a warning. A dependency with retries and no circuit breaker melts down in a retry storm, and adding a breaker saves it.

Every task updates [[03-simulation-engine]] (spec + Decisions) and adds or adjusts golden tests.

## Tasks

### T-8.1 — Queues actually buffer
- [x] T-8.1 done
  - Also touched `registry/components.ts` (`retentionMsgs` config field, so queue/stream inspectors gain a "Retention (messages)" input), `node-models.test.ts`, 02/05 specs.

**Files:** `src/lib/simulation/node-models.ts`, `src/lib/simulation/engine.ts`, `src/lib/core/sim-result.ts`, `tests/engine.test.ts`
**Accept:** Async-category nodes (queue, stream) hold a large backlog: a configurable retention (instead of the 0.5s-of-capacity cap every node gets today, `node-models.ts:181`). Consumers drain it at their own capacity (pull semantics). `SimFrame` carries queue depth and consumer lag (seconds) per async node. Golden test, the review's repro: client → app (5) → queue → workers (2), 1500 RPS, spike ×3 for 3s ⇒ **0% client errors**, backlog grows then drains, lag returns to 0.

### T-8.2 — Async failures separate from client errors
- [x] T-8.2 done
  - Also: the client latency fold stops at async nodes (lead review: a queue design read p95 ≈ 660 ms from the worker behind it, now ≈ 21–34 ms); the canvas queue badge shows messages (amber) instead of RPS carry units; the Quick bar gets compact cards when a 4th (Queue lag) card is shown.

**Files:** `src/lib/simulation/engine.ts`, `src/lib/simulation/verdict.ts`, `src/lib/core/scenario.ts`, HUD
**Accept:** `errorRate` counts only drops on the sync (client) path (today all drops are summed, `engine.ts:422`). Async drops (backlog overflow) are reported separately. New optional NFR `pass.maxLagSec` with a verdict criterion. The HUD shows max consumer lag when the design has async nodes.

### T-8.3 — Split vs fan-out edges
- [x] T-8.3 done
  - Also: the open FlowEdge editor gets `zIndex 1001` so the wider popover isn't painted under nodes on short edges.

**Files:** `src/lib/core/design.ts`, `src/lib/simulation/engine.ts`, `src/lib/validation/checks.ts`, `src/components/canvas/edges/FlowEdge.tsx`, `src/persistence/local.ts`, `examples/twitter.json`
**Accept:** LB edges keep `trafficShare` (a split, which must sum to 1). Every other edge is a **call**, with `callsPerRequest` (default 1, may be fractional, e.g. 0.2 = "20% of requests enqueue a job"). The sum-to-1 warning applies only to LB sources. Import maps a legacy non-LB `trafficShare` to `callsPerRequest` (the propagation math is equivalent, since both multiply). `examples/twitter.json` (app → cache 1.0 + app → fanout 0.2) validates clean. The edge inspector labels the two kinds differently.

### T-8.4 — Sequential calls add latency
- [x] T-8.4 done

**Files:** `src/lib/simulation/engine.ts` (`meanPathMs`), `tests/engine.test.ts`
**Accept:** A node's client-path latency = own latency + the **sum** of its sync calls' latencies, weighted by `callsPerRequest`. Today it's a traffic-weighted *average*, which is right only for LB splits, and LB edges keep the average. Golden test: an app calling a cache and then a DB sequentially pays both.

### T-8.5 — Timeouts and retries
- [x] T-8.5 done
  - Also touched core/sim-result (`EdgeFrame`), new `simulation/edge-state.ts`, persistence/flow-adapter/design-store, `panels/{EdgeInspector,styles}.tsx`, examples `retry-storm.json` + `dependency-blip.json`; the plan's node-models drop expectation was off (2000 not 4000), test fixed to match golden 1.

**Files:** `src/lib/core/design.ts`, `src/lib/simulation/engine.ts`, `src/lib/simulation/node-models.ts`, `src/components/panels/` edge inspector
**Accept:** Sync edges get optional `timeoutMs` and `retries`. Requests that drop or exceed the timeout at the target count as failed, and each retry re-offers load to the target next tick. Golden test, retry storm: a dependency briefly saturates, retries ×3 amplify the load, and it stays overloaded after the trigger ends. Without retries it recovers.

### T-8.6 — Circuit breaker
- [x] T-8.6 done
  - Also: breakers only on edges that support resilience (not queue → consumer); group headings (`GROUP_HEADING`) split Resilience / Circuit breaker in the Edge panel; checkbox reads "Enabled" under the "Circuit breaker" heading; a live phase line in the panel; number fields clamp on blur/Enter, not per keystroke (lead review).

**Files:** same area as T-8.5
**Accept:** An optional per-edge breaker: it opens when the target's error rate passes a threshold for N ticks, fails fast (no load on the target, errors at the caller) while open, then half-opens after a cooldown. Event log lines for open, half-open and closed. Golden test: the T-8.5 retry storm recovers with the breaker on.

### T-8.7 — More honest tail latency
- [ ] T-8.7 done

**Files:** `src/lib/simulation/engine.ts`, `src/lib/simulation/node-models.ts`
**Accept:** Replace the fixed `p95 = 1.6 × mean` (`engine.ts:287`). Note that M/M/1 time-in-system is exponential, so p95 ≈ ln(20) × mean ≈ 3.0 × mean, meaning the current factor *understates* the tail. The plan picks and documents an approximation (per-node percentile composition, or a utilization-dependent factor) and explains it in the UI tooltip. Golden tests are updated, with old → new numbers recorded in the Decisions entry.

## Decisions

- 2026-11-06 (user): lost queued jobs are an **advisory**, not a verdict failure; async health fails a run only via the optional `maxLagSec` NFR (T-8.2).
- 2026-11-06 (user): timeouts/retries/breaker settings live in a new right-panel **Edge** section (both modes); the canvas popover keeps share/calls + sync/async (T-8.5/T-8.6).
- 2026-11-06 (T-8.1, lead call): queue retention is size-based (`retentionMsgs`, default 1M) not time-based — runs last ~60 s, a time retention could never trigger.
- 2026-11-06 (T-8.1, lead call): a sink queue (no consumer) drains unlimited; a partitioned consumer edge pauses the drain (backlog holds) instead of dropping.
- 2026-11-06 (T-8.1, lead call): queue latency = enqueue cost only; backlog wait is consumer lag (`lagSec`), not producer p95.
- 2026-11-06 (T-8.2, lead call): client share is a per-node, per-tick fraction (entry 1, async nodes 0, else sync-carried inflow share). A shared DB charges clients only for their share of its drops, and a cut producer→queue edge counts as a client error (the enqueue failed).
- 2026-11-06 (T-8.2, lead call): `servedRps` is now client-facing throughput; async drops don't reduce it.
- 2026-11-06 (T-8.2, lead review): nothing past an async node is on the client latency path (consumers pull), the same rule as for errors. Carried into the T-8.4 plan's `clientPathTerms`.
- 2026-11-06 (T-8.2, lead call): the queue node badge shows backlog in messages, amber while buffering and red only when overloaded.
- T-8.3: split-vs-call is registry data (ComponentDef.splitsTraffic, lb only); files beyond the list: registry, design-store, flow-adapter, starter, scripts/sim.ts (parses through persistence's migrating guard).
- 2026-11-06 (T-8.3, lead call): split vs call is registry data (`ComponentDef.splitsTraffic`, lb only, via `isSplitSource`); api_gateway route mixes are written as fractional calls.
- 2026-11-06 (T-8.3, lead call): legacy edges migrate on read via `parseDesignGraph`, with unknown edge keys dropped. Practice's mount-time phase-notes autosave then rewrites the record in the new shape; that's harmless.
- T-8.4: call-edge math was already a sum once T-8.3 multiplies by callsPerRequest; the code change is LB splits normalizing over live split flow (partitioned backend no longer flatters p95) + the clientPathTerms/meanPathMs seam for T-8.7.
- 2026-11-06 (T-8.4, lead call): an LB split averages over its *live* backends (denominator = live split flow, not served(lb)), so a partitioned backend no longer halves p95 (11.77 → 20.30 ms); calls are sequential (no parallel fan-out max).
- T-8.5: timeout = exponential tail fraction exp(−t/pathMs(target)); tail-drop attribution; only exhausted attempts are errors; edge fields live in the right panel's Edge section (not the canvas popover); files beyond the list: core/sim-result, edge-state.ts (new), persistence, flow-adapter, design-store, panels/styles.ts, examples retry-storm + dependency-blip.
- 2026-11-06 (T-8.5, lead call): timeout failure is the exponential tail fraction exp(−t/pathMs) rather than an all-or-nothing cliff; timed-out work still loads the target; only exhausted attempts count as client errors; retries go to the same backend next tick, no backoff.
- T-8.6: breaker trips on the edge's call failure rate (incl. timeouts), half-open = one tick at 10% probe; inspector = checkbox + 3 exposed fields (50% · 0.5 s · 5 s); new files simulation/breaker.ts, panels/BreakerControls.tsx; toggles recorded for the grader.
- 2026-11-07 (T-8.6, lead call): the breaker trips on the edge's own call failure rate (drops + timeouts, over admitted calls), strictly above the threshold for N ticks; half-open is one tick that lets 10% of calls through as a probe; defaults are 50% · 0.5 s · 5 s; rejected calls schedule no retries; an LB edge's breaker rejects its own share without rerouting.
- 2026-11-07 (T-8.6, lead review): edge-panel number fields keep a draft while you type and clamp on blur/Enter (per-keystroke clamping made "30" or "0.5" untypeable).
