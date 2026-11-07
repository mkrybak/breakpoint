---
tags: [milestone]
status: planning
milestone: M13
depends-on: M12
---

# M13 — Practice step boards

**Goal:** The first three Practice steps get a real place to work. Requirements becomes two editable lists, Entities becomes a board of boxes joined by typed relationship lines, and API becomes a list of endpoint cards. The step chips become clickable, so earlier boards can be reopened and edited while the clock keeps running on the current step. Today these steps only get a small notes textarea while the canvas sits locked.

**Spec:** [[docs/superpowers/specs/2026-11-07-practice-step-boards-design]]. Read it first. Its Decisions are user calls and must not be re-decided.

**Demo:** Start a Practice design. On Requirements, type three functional requirements (Enter adds the next one); Non-functional is already filled in from the scenario. On Entities, add User, Order and Product with typed fields, connect User → Order and set the line to one-to-many (crow's foot on the Order end), then Order ↔ Product as many-to-many. On API, add `POST /v1/orders → 201` with request and response JSON. In High-level design, click the Entities chip: the board replaces the canvas, the metrics bar stays, and the HLD clock keeps counting. Then go back. Export the bundle, import it on the review screen, and see all three boards there and in the `.review.md` report.

Run UI tasks via `/build` or `/ui` (screenshots required). Verification for every task: `npm run lint && npm run typecheck && npm test` (and the e2e spec it adds).

## Global constraints

- No new runtime dependencies. The Entities board uses `@xyflow/react`, which is already in the dependency budget.
- Board types are plain data. Engines (`src/lib/**`) never import React, React Flow or Zustand. Follow the import table in `05-engines.md`.
- Old designs and old `.breakpoint.json` bundles without boards must load with empty boards, with no migration and no error. Existing `phaseNotes` are never rewritten or converted.
- Applies to Practice (and Interview, which renders the Practice layout today). Quick mode is untouched.
- The persisted phase clock (`bp:phase:<id>`) keeps its shape. The viewed step is UI-only state.

## Review focus

The inputs most likely to bite a user that no single board's happy path covers. Each line is pinned by a test in the task that owns it.

1. **A timer runs out while the user is typing** on the current board: focus and the text being typed stay put, and the view doesn't switch (T-13.2).
2. **Reload while viewing an earlier step** opens on the clock's current step, and the clock state is unchanged (T-13.2).
3. **Deleting an entity that has relationship lines** removes those lines too; no dangling relations get saved or exported (T-13.4).
4. **Invalid or half-typed JSON** in an endpoint body saves, exports and re-imports byte-for-byte and never blocks typing (T-13.5).
5. **An old design or bundle with no boards** (and one with a malformed `boards` field) opens with empty boards, and its notes are intact (T-13.1).

## Tasks

### T-13.1 — Board data: types, persistence, store
- [ ] T-13.1 done

**Files:** `src/lib/core/` (new `boards.ts` + `index.ts` export), `src/persistence/local.ts` (`DesignRecord`, `buildDesignRecord`, `parseDesignRecord`, `RunBundle` round-trip), `src/stores/design-store.ts` (state, actions, autosave), `src/lib/core/action.ts` (if a new action kind is used), `../02-data-model.md` (shapes + a Decisions line), tests.
**Accept:**
- Plain-data types for the three boards:
  - Requirements: two ordered lists of `{ id, text, source?: "scenario" }`.
  - Entities: boxes `{ id, name, fields: { id, name, type }[], position: { x, y } }` plus relations `{ id, from, to, kind: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many" }`.
  - API: endpoints `{ id, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url, status, requestBody, responseBody }`, with the bodies as raw strings.
- The planner names the record field (for example `DesignRecord.boards`).
- `DesignRecord` carries the boards. `parseDesignRecord` is forgiving: a missing field or a malformed field or item yields an empty board, or drops that item. Relations whose `from`/`to` don't name an existing entity are dropped on load.
- The `RunBundle` round-trip keeps boards byte-identical. The planner decides whether `version` stays 1 (forgiving defaults) and logs it.
- design-store exposes the boards plus granular update actions that the three board tasks need. Autosave picks up board changes like notes. Attach and import load them. Board edits record a debounced action-log entry (one per burst, like `note_edited`), so the review timeline shows when artifacts changed. The planner picks the reused or new `ActionKind` and logs it.
- Tests: round-trip a record with all three boards; parse an old record with no boards; parse malformed boards; drop dangling relations; bundle export → parse is identical (review focus 5).

### T-13.2 — Clickable steps and the board slot
- [ ] T-13.2 done

**Files:** `src/stores/phase-store.ts` (viewed step, UI-only), `src/components/panels/PhaseBar.tsx`, `src/components/layout/PracticeWorkspace.tsx` (center slot), `src/components/panels/PhaseNotes.tsx` (follows the viewed step), new `src/components/boards/StepBoard.tsx` (switch over steps, placeholder boards until T-13.3–13.5 land), `e2e/practice-steps.spec.ts`.
**Accept:**
- Step chips are buttons with clear done / current / viewed states.
- Clicking an earlier step views its board and the clock keeps running on the current step (spec, user call). Clicking a later step jumps the clock there like Skip and starts its timer. Clicking the current step returns the view to it.
- While the view is behind the clock, a chip shows the way back with the current step's live time ("← Back to API · 03:10" style).
- When a timer runs out, the clock advances but the view stays on the board being used. The phase bar highlights the new current step and shows a "Go to Entities →" style nudge. The view never changes because of the clock (spec, user call). This also holds while viewing an earlier step when a boundary passes.
- Before High-level design the center shows the current or viewed step's board instead of the locked canvas. In HLD and Deep dives the center shows the canvas, unless an earlier board is being viewed. Then only the canvas spot is replaced: the metrics bar, verdict and replay scrubber stay visible, a running test keeps running, and the palette and node config panel hide and come back on return (spec, user call).
- The viewed step isn't persisted. A reload opens on the clock's step.
- e2e covers: jumping back keeps the clock counting; a timeout while typing in a board keeps focus and text (review focus 1, via a short phase budget or a test hook the planner picks); reload while viewing an earlier step (review focus 2).
- Screenshots: each step, the back chip, the timeout nudge, an HLD view of an earlier board during a run.

### T-13.3 — Requirements board
- [ ] T-13.3 done

**Files:** new `src/components/boards/RequirementsBoard.tsx`, `src/components/panels/PhaseNotes.tsx` (stop seeding `nfrNotesTemplate` into notes), seeding helper (reuse the scenario values `nfrNotesTemplate` uses today), tests.
**Accept:**
- Functional and Non-functional columns side by side, each a list of one-line items.
- Items can be edited inline, dragged to reorder (keyboard reorder too), and deleted.
- Enter adds a new item below and focuses it. Backspace on an empty item deletes it and focuses the previous one. "+ add requirement" adds an item at the end.
- Non-functional is seeded once per design from the scenario (target load, p95 budget, max error rate, max lag when present, consistency) when it's empty and the design is attached. Seeded items show a "scenario" tag and are otherwise ordinary.
- New designs no longer get the notes template in the notes box. An old design keeps its note untouched and still gets its list seeded (spec, assistant's call).
- Unit test: seeding values match the scenario, and seeding doesn't re-run after the user empties the list in the same session. The planner decides how "once" is tracked.
- Screenshots: fresh design, edited lists.

### T-13.4 — Entities board
- [ ] T-13.4 done

**Files:** new `src/components/boards/entities/` (board, entity node, relation edge with crow's-foot markers, type picker), tests.
**Accept:**
- A separate React Flow instance (not the simulation canvas) with the same dotted background, pan and zoom.
- "+ Entity" adds a box at a free spot and focuses its name. A box has a name header and a list of fields (name + free-text type). Enter in a field adds the next one. Fields can be deleted and reordered.
- Boxes drag; positions are saved. Boxes can be deleted.
- Deleting a box deletes its relations (review focus 3, unit test on the store action).
- Dragging from one box to another creates a relation, defaulting to one-to-many.
- Line ends show the type in crow's-foot notation (a bar for one, a foot for many), with no text on the line (spec, user call). Clicking a line opens a picker of the four types drawn as icons. Lines can be deleted.
- Self-relations and re-pointing a line's end are the planner's call (log it).
- Screenshots: the demo's User / Order / Product board with an open picker, at 1440×900 and 1280×800.

### T-13.5 — API board
- [ ] T-13.5 done

**Files:** new `src/components/boards/api/` (endpoint list, endpoint card, JSON field), tests.
**Accept:**
- A vertical list of endpoint cards with "+ Endpoint" at the top.
- Each card has a method picker (GET/POST/PUT/PATCH/DELETE, colored per method), a monospace URL field, a status code field, and request and response JSON text areas side by side with light syntax coloring.
- Invalid JSON gets a subtle "not valid JSON" hint and is stored exactly as typed. It never blocks typing, saving or export (review focus 4: a unit test that round-trips half-typed JSON through record and bundle).
- Cards can be deleted and reordered.
- The workspace's right column shows a read-only list of the design's entity names while on the API step.
- Screenshots: two endpoints, one with invalid JSON.

### T-13.6 — Boards on the review screen and in the report
- [ ] T-13.6 done

**Files:** `src/components/review/ReviewScreen.tsx` (read-only board views next to the notes), `src/persistence/report.ts` (`buildReviewReport`), shared read-only renderers (reuse the T-13.3–13.5 components in a read-only mode where practical), tests, `e2e/practice-steps.spec.ts` (extend).
**Accept:**
- The review screen shows all three boards read-only: requirement lists, the entity diagram with crow's-foot lines, and endpoint cards. It works after a bundle import (not just in-session).
- `buildReviewReport` adds a section per board: requirements as bullet lists, entities as `Name` + fields with a relations list using words ("User 1 → many Order"), and endpoints as `METHOD url → status` with fenced JSON bodies. The existing notes stay in the report.
- An e2e test runs the milestone demo end to end through export → import → review.
- Screenshots: review screen with all three boards.

## Decisions

- (log deviations here)
- 2026-11-07: Milestone scoped from the step-boards spec. User calls are in the spec's Decisions: crow's-foot lines with no text, the clock keeps running when viewing back, the view stays on timeout, a board replaces only the canvas in HLD, and the requirements and endpoint shapes per the approved mockups.
