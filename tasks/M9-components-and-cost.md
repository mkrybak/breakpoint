---
tags: [milestone]
status: planning
milestone: M9
depends-on: M8
---

# M9 — More components + cost

**Goal:** Cover the components interviews actually ask about (realtime connections, multi-region) and make cost visible, so "it survives" is weighed against "what it costs".

**Demo:** Build a chat system with a WebSocket gateway across two regions. Toggle the cost overlay and see $/month per node and in total. Fail a region and watch geo-routing shift traffic while replication lag shows up as stale reads.

## Tasks

### T-9.1 — Sourced capacity numbers
- [ ] T-9.1 done

**Files:** `src/lib/registry/types.ts`, `src/lib/registry/components.ts`, `src/components/panels/NodeConfigPanel.tsx`
**Accept:** Every `ComponentDef` carries a short `assumptions` note (what the number means, e.g. "4k RPS = one 4-vCPU instance, ~10ms CPU per request") plus a source where one exists. The node config panel shows it. The README stops claiming "real hardware numbers" where none are cited.

### T-9.2 — WebSocket gateway component
- [ ] T-9.2 done

**Files:** `src/lib/registry/components.ts`, `src/lib/simulation/node-models.ts` (if it needs its own model), `src/components/icons.tsx`
**Accept:** A `ws_gateway` kind whose capacity is **concurrent connections** plus messages/s, not just RPS. Its model (registered in `modelByKind`) saturates on whichever limit is hit first. Scenario `live-scores.json`: a large connected audience plus a message burst. The palette, canvas and sim pick it up through the registry.

### T-9.3 — Regions on the canvas
- [ ] T-9.3 done

**Files:** `src/components/canvas/nodes/GroupNode.tsx` (planned in [[01-architecture]], never built), `src/lib/core/design.ts`, `src/stores/flow-adapter.ts`
**Accept:** Region containers on the canvas; a node belongs to at most one region. Edges that cross regions add a configurable RTT (default ~70ms) to the latency path. Saved designs without regions load unchanged.

### T-9.4 — Geo-replication + global routing
- [ ] T-9.4 done

**Files:** registry (a `global_lb` / GeoDNS kind), `src/lib/simulation/rules.ts`, `src/lib/simulation/verdict.ts`, db configs
**Accept:**
- A global load balancer kind routes traffic to regions.
- Databases get a cross-region replication mode:
  - async: replication lag, reads in other regions are eventual
  - sync: writes pay the cross-region RTT
- A new `region-outage` stress rule kills every node in a region (registered in `ruleAppliers`).
- The strong-consistency check flags reads served by an async cross-region replica.
- New preset: `region-outage.json`.

### T-9.5 — Cost model (engine)
- [ ] T-9.5 done

**Files:** new engine `src/lib/cost/` (imports core + registry), `src/lib/registry/` (cost fields), `.dependency-cruiser.cjs`, [[05-engines]]
**Accept:** A pure `estimateCost(graph, scenario?) → { perNode, totalMonthly }`. Registry entries declare pricing: a per-instance $/month × replicas for provisioned kinds, per-request or per-GB for managed kinds (CDN, blob, queue). The assumptions and the date of the prices are documented. Adding a new component's cost = adding data. The engine table and depcruise rules are updated.

### T-9.6 — Cost overlay
- [ ] T-9.6 done

**Files:** canvas node component, HUD, overlay toggle
**Accept:** A toggle shows a $/month badge on each node and the total in the HUD, updating live as replicas or components change. Practice and Interview show the per-node breakdown; Quick shows the total only (keeps Quick simple). Run via `/ui`.

### T-9.7 — Rate limiter component (optional)
- [ ] T-9.7 done

**Files:** `src/lib/registry/components.ts`, `src/lib/simulation/node-models.ts`
**Accept:** A `rate_limiter` kind that rejects above a configured RPS, returning fast errors instead of queueing. It shows the "shed load at the edge" answer working against the celebrity-tweet preset.

## Decisions

- (log deviations here)
