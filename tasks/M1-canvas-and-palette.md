---
tags: [milestone]
status: active
milestone: M1
depends-on: M0
---

# M1 — Canvas & component palette

**Goal:** Candidate can build a design: drag components from a palette, connect them, configure them, and the graph serializes to the [[02-data-model|DesignGraph]] schema.

**Demo:** Build the Twitter-example design (client → LB → app ×2 → cache → Postgres) in under a minute; refresh page; reload it from localStorage.

## Tasks

### T-1.1 — Component registry
- [x] T-1.1 done

**Files:** `src/lib/registry/types.ts`, `src/lib/registry/components.ts`
**Accept:** `ComponentDef` type exactly as in [[02-data-model]]; registry seeded with all 13 kinds and the capacity numbers table; unit test validates every entry (capacity > 0, baseMs > 0, unique kinds).

### T-1.2 — Canvas with generic ComponentNode
- [x] T-1.2 done
  - Deviation: store gained a `measured` map (ephemeral, echoed back to React Flow) — without it RF12 keeps nodes hidden; see 02-data-model Decisions.

**Files:** `src/components/canvas/DesignCanvas.tsx`, `nodes/ComponentNode.tsx`, `src/stores/design-store.ts`
**Accept:** React Flow canvas; `ComponentNode` renders icon, label, kind badge, placeholder utilization bar; nodes draggable/deletable; store holds graph in DesignGraph shape (not raw React Flow types — adapter functions `toFlow`/`fromFlow`).

### T-1.3 — Palette with drag-and-drop
- [x] T-1.3 done
  - Deviation: beyond Palette.tsx — page.tsx (sidebar layout), DesignCanvas (drop target + ReactFlowProvider), design-store (demo seed removed, designs start empty), store tests (seed became a test fixture).
  - Deviation: plan's `fixtureGraph()` lacked a return-type annotation and failed `tsc` (config literals didn't unify to `DesignGraph` without contextual typing); added `: DesignGraph` to match the original `seedGraph()` signature it was copied from.

**Files:** `src/components/palette/Palette.tsx`
**Accept:** Palette lists registry entries grouped by category; drag onto canvas creates node with defaults; palette is 100% registry-driven (adding registry entry = appears in palette, zero code).

### T-1.4 — Edges with traffic share + validation
- [x] T-1.4 done
  - Deviation: validation is the engine folder `src/lib/validation/` (types/checks/index), not `src/lib/validation.ts` — matches 05-engines + the existing depcruise config.
  - Deviation: beyond FlowEdge.tsx — design-store (onConnect, updateEdge, selectedEdgeIds), flow-adapter (edge type "flow", arrow marker, no animated), DesignCanvas (edgeTypes, onConnect, warnings Panel).

**Files:** `src/components/canvas/edges/FlowEdge.tsx`, `src/lib/validation.ts`
**Accept:** Connect nodes; edge inspector sets `trafficShare` and `sync/async`; validation warnings shown inline: outbound shares ≠ 1, orphan nodes, no entry client node, cycles on sync paths.

### T-1.5 — Node config panel + save/load
- [x] T-1.5 done
  - Deviation: persistence split per 01-architecture layout — record shape/guard/storage IO in `src/persistence/local.ts` (new), autosave subscription + designId/designName in design-store; NodeConfigPanel is the always-visible right sidebar and also hosts export/import + the attach effect.
  - Deviation: beyond the task's file list — `src/lib/core/action.ts` (+ core index) adds Phase/ActionKind/ActionEvent (DesignRecord needs them; 05-engines lists ActionEvent in core), and `page.tsx` gains the right sidebar.

**Files:** `src/components/panels/NodeConfigPanel.tsx`, localStorage persistence in design-store
**Accept:** Selecting a node opens config from registry `configFields` (replicas, hitRate, sharded, consistencyMode); graph autosaves to localStorage; "export/import JSON" buttons work.

## Decisions

-
