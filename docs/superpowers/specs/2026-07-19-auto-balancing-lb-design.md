---
tags: [spec, simulation, load-balancer]
status: approved
created: 2026-07-19
---

# Auto-balancing load balancer — design

## Problem

Load distribution between a node and its downstream targets is controlled by a
manual per-edge `trafficShare` (0–1, default 1). During simulation a node's
outgoing traffic is scaled by each outbound edge's `trafficShare`
(`engine.ts` → `propagateTraffic`). Validation warns when a node's outbound
shares don't sum to 1 (`checks.ts` → `checkOutboundShares`).

Consequently, wiring a load balancer to N backends requires hand-editing each
edge to `1/N` or the design both mis-simulates and trips the sum-to-1 warning.
A load balancer should split its traffic across its connected backends on its
own.

## Decision summary

| Question | Decision |
|---|---|
| What does "auto-balance" do? | **Even split**, computed when the graph changes (static, not per-tick). |
| Which nodes? | **Only `lb` (Load balancer) source edges.** All other nodes keep manual shares unchanged. |
| Manual override? | **Auto is the default, but a share can be overridden manually.** |
| Health-aware / dynamic rerouting? | **Out of scope** for this change. |

## Scope

Behavior applies **only** to edges whose **source node is of kind `lb`**.
Every other node's `trafficShare` behavior is untouched.

## Data model

`src/lib/core/design.ts` — add one optional field to `DesignEdge`:

```ts
/**
 * Only meaningful when the source node is an `lb`. When true (the default when
 * absent), this edge's trafficShare is managed automatically: it takes an even
 * slice of the share left over after the LB's manually-overridden edges.
 * Set to false when the user overrides the share by hand.
 */
autoShare?: boolean; // absent === true
```

`trafficShare` remains a plain, **materialized** number. The recompute writes
real numbers into it, so:

- **`engine.ts` is unchanged** — it keeps reading `edge.trafficShare` as-is.
- **`checks.ts` is unchanged** — the sum-to-1 check keeps working and stays as
  a safety net for pathological manual overrides.

## Recompute rule

Lives in `src/stores/design-store.ts`, the single writer of graph mutations.

A helper `rebalanceLb(graph, lbNodeId)` recomputes one LB's outbound edges:

1. `manualSum` = Σ `trafficShare` over that LB's outbound edges with
   `autoShare === false`.
2. `autoCount` = number of that LB's outbound edges with `autoShare !== false`.
3. Each auto edge's `trafficShare = autoCount > 0 ? max(0, (1 − manualSum)) / autoCount : trafficShare` (leave manual edges as-is).

Auto edges therefore always fill the remainder, so an all-auto LB sums to
exactly 1 (no sum-to-1 warning), and manual overrides coexist by taking a fixed
slice while auto edges divide what's left.

**Triggers** — the store mutates the graph through React Flow change handlers
plus a couple of explicit actions; recompute the affected LB(s) after any that
change an LB's outbound edge set:

- `onConnect` — a new edge is created here. New edges from an LB source default
  to `autoShare: true`; then rebalance that LB. (There is no separate `addEdge`.)
- `onEdgesChange` — edge removals arrive here as `remove` changes. After
  applying them, rebalance every LB that lost an outbound edge.
- `onNodesChange` — node removals arrive here as `remove` changes. React Flow
  emits the corresponding edge removals through `onEdgesChange`, so rebalancing
  driven from `onEdgesChange` covers dropped-backend cases; confirm during
  implementation that node deletion actually cascades its edges, and if not,
  rebalance affected LBs from `onNodesChange` too.
- `updateEdge` — extend its patch type to include `autoShare`. Setting
  `trafficShare` or toggling `autoShare` on an LB edge rebalances that LB
  (a manual share re-divides the remainder among the auto edges).

There is no reconnect/edge-source-change action, so none is handled.

Recompute fires **only on these edits, never on graph load/import**. Saved and
imported graphs keep their exact `trafficShare` values until the user next edits
the LB's connections.

## UI (`src/components/canvas/edges/FlowEdge.tsx`)

Behavior branches on whether the edge's **source node is an `lb`** (the edge
already knows its `source`; look the node up via the design store, or thread the
kind through `flow-adapter`).

**LB-source edge, auto (`autoShare !== false`):**

- Collapsed label: `33% · auto`.
- Selected inspector: the number box (prefilled with the computed
  `trafficShare`) **plus an "Auto" checkbox, checked**.
- Typing a value in the box **or** unchecking "Auto" → `updateEdge(id, { autoShare: false, trafficShare: <typed-or-current> })`, which flips the edge to manual and rebalances the remaining auto edges.

**LB-source edge, manual (`autoShare === false`):**

- Number box editable as today, plus a small **"↺ auto"** control that calls
  `updateEdge(id, { autoShare: true })` and rebalances.

**Non-LB edge:** completely unchanged from today.

## Persistence (`src/persistence/local.ts`)

Edge import validation accepts an optional `autoShare` boolean; absent is valid
(treated as `true` at read time via the `absent === true` convention). No
migration of existing stored graphs is required.

## Edge cases

| Case | Result |
|---|---|
| LB with one auto backend | that edge → 100%. |
| LB, all auto, N backends | each → `1/N`; sums to 1. |
| Manual overrides sum > 1 | auto edges clamp to 0; `checkOutboundShares` correctly warns (manual alone exceeds 1). |
| Last auto edge removed/overridden | remaining manual edges keep their values; sum-to-1 warning fires if they don't sum to 1 (correct). |
| Non-LB fan-out node | unchanged — manual shares, existing warning. |

## Non-goals

- No per-tick / health-aware dynamic rerouting (routing away from dead or
  overloaded backends during the sim).
- No capacity-weighted split.
- No change to the simulation engine or validation logic.

## Touched files

- `src/lib/core/design.ts` — add `autoShare?: boolean` to `DesignEdge`.
- `src/stores/design-store.ts` — `rebalanceLb` helper; default new LB edges to
  `autoShare: true` in `onConnect`; call the helper from `onConnect`,
  `onEdgesChange`, `updateEdge` (and `onNodesChange` if node deletion doesn't
  cascade edges); widen `updateEdge`'s patch type to include `autoShare`.
- `src/stores/flow-adapter.ts` — carry `autoShare` (and the source node kind, if
  the edge component needs it) through `FlowEdgeData`.
- `src/components/canvas/edges/FlowEdge.tsx` — auto/manual UI branch.
- `src/persistence/local.ts` — accept optional `autoShare` on import.
