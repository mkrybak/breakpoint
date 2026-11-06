---
tags: [milestone]
status: planning
milestone: M8
depends-on: M7
---

# M8 — Trustworthy simulation

**Goal:** Fix the places where the sim punishes correct designs or flatters wrong ones, so someone who knows systems can't easily poke holes in it.

**Demo:** A queue in front of workers absorbs a 3× burst with zero client errors and a visible lag that drains. An app server fanning out to a cache *and* a queue no longer trips a warning. A dependency with retries and no circuit breaker melts down in a retry storm, and adding a breaker saves it.

Every task updates [[03-simulation-engine]] (spec + Decisions) and adds or adjusts golden tests.

## Tasks

### T-8.1 — Queues actually buffer
- [ ] T-8.1 done

**Files:** `src/lib/simulation/node-models.ts`, `src/lib/simulation/engine.ts`, `src/lib/core/sim-result.ts`, `tests/engine.test.ts`
**Accept:** Async-category nodes (queue, stream) hold a large backlog: a configurable retention (instead of the 0.5s-of-capacity cap every node gets today, `node-models.ts:181`). Consumers drain it at their own capacity (pull semantics). `SimFrame` carries queue depth and consumer lag (seconds) per async node. Golden test, the review's repro: client → app (5) → queue → workers (2), 1500 RPS, spike ×3 for 3s ⇒ **0% client errors**, backlog grows then drains, lag returns to 0.

### T-8.2 — Async failures separate from client errors
- [ ] T-8.2 done

**Files:** `src/lib/simulation/engine.ts`, `src/lib/simulation/verdict.ts`, `src/lib/core/scenario.ts`, HUD
**Accept:** `errorRate` counts only drops on the sync (client) path (today all drops are summed, `engine.ts:422`). Async drops (backlog overflow) are reported separately. New optional NFR `pass.maxLagSec` with a verdict criterion. The HUD shows max consumer lag when the design has async nodes.

### T-8.3 — Split vs fan-out edges
- [ ] T-8.3 done

**Files:** `src/lib/core/design.ts`, `src/lib/simulation/engine.ts`, `src/lib/validation/checks.ts`, `src/components/canvas/edges/FlowEdge.tsx`, `src/persistence/local.ts`, `examples/twitter.json`
**Accept:** LB edges keep `trafficShare` (a split, which must sum to 1). Every other edge is a **call**, with `callsPerRequest` (default 1, may be fractional, e.g. 0.2 = "20% of requests enqueue a job"). The sum-to-1 warning applies only to LB sources. Import maps a legacy non-LB `trafficShare` to `callsPerRequest` (the propagation math is equivalent, since both multiply). `examples/twitter.json` (app → cache 1.0 + app → fanout 0.2) validates clean. The edge inspector labels the two kinds differently.

### T-8.4 — Sequential calls add latency
- [ ] T-8.4 done

**Files:** `src/lib/simulation/engine.ts` (`meanPathMs`), `tests/engine.test.ts`
**Accept:** A node's client-path latency = own latency + the **sum** of its sync calls' latencies, weighted by `callsPerRequest`. Today it's a traffic-weighted *average*, which is right only for LB splits, and LB edges keep the average. Golden test: an app calling a cache and then a DB sequentially pays both.

### T-8.5 — Timeouts and retries
- [ ] T-8.5 done

**Files:** `src/lib/core/design.ts`, `src/lib/simulation/engine.ts`, `src/lib/simulation/node-models.ts`, `src/components/panels/` edge inspector
**Accept:** Sync edges get optional `timeoutMs` and `retries`. Requests that drop or exceed the timeout at the target count as failed, and each retry re-offers load to the target next tick. Golden test, retry storm: a dependency briefly saturates, retries ×3 amplify the load, and it stays overloaded after the trigger ends. Without retries it recovers.

### T-8.6 — Circuit breaker
- [ ] T-8.6 done

**Files:** same area as T-8.5
**Accept:** An optional per-edge breaker: it opens when the target's error rate passes a threshold for N ticks, fails fast (no load on the target, errors at the caller) while open, then half-opens after a cooldown. Event log lines for open, half-open and closed. Golden test: the T-8.5 retry storm recovers with the breaker on.

### T-8.7 — More honest tail latency
- [ ] T-8.7 done

**Files:** `src/lib/simulation/engine.ts`, `src/lib/simulation/node-models.ts`
**Accept:** Replace the fixed `p95 = 1.6 × mean` (`engine.ts:287`). Note that M/M/1 time-in-system is exponential, so p95 ≈ ln(20) × mean ≈ 3.0 × mean, meaning the current factor *understates* the tail. The plan picks and documents an approximation (per-node percentile composition, or a utilization-dependent factor) and explains it in the UI tooltip. Golden tests are updated, with old → new numbers recorded in the Decisions entry.

## Decisions

- (log deviations here)
