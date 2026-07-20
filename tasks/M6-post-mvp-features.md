---
tags: [milestone]
status: planning
milestone: M6
depends-on: M5
---

# M6 — Post-MVP features

**Goal:** Incremental feature work on top of the shipped MVP. Each task is one spec → one plan → one commit, drawn from the post-MVP backlog in [[04-roadmap]]. Milestones M0–M5 stay closed; new features land here.

**Demo:** Per task — see each task's Accept criteria.

## Tasks

### T-6.1 — Auto-balancing load balancer
- [x] T-6.1 done

**Spec:** [[docs/superpowers/specs/2026-07-19-auto-balancing-lb-design]]
**Files:** `src/lib/core/design.ts`, `src/stores/design-store.ts`, `src/stores/flow-adapter.ts`, `src/components/canvas/edges/FlowEdge.tsx`, `src/persistence/local.ts`
**Accept:** Wiring an `lb` node to N backends auto-assigns each outbound edge an even `1/N` share (no manual entry, no sum-to-1 warning). Shares recompute when a backend is added or removed, on edits only — never on graph load/import. A share can still be overridden by hand: typing a value or unchecking "Auto" flips that edge to a fixed slice while the remaining auto edges divide what's left; a manual edge offers a reset back to auto. The simulation engine and validation logic are unchanged (`trafficShare` stays a materialized number). Only `lb`-source edges are affected; all other fan-out nodes keep manual shares. `local.ts` import accepts an optional `autoShare` boolean with no migration.

Deviation: tests (`design-store`, `flow-adapter`, `persistence`) and the `02-data-model.md` doc touch-up were edited beyond the task's Files list; no engine file changed.
