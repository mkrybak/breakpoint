---
tags: [spec]
status: draft
---

# Practice step boards — design

Mockups from the brainstorm: `.superpowers/brainstorm/408984-1794072193/content/step-boards.html` and `step-boards-v2.html` (not committed; rough wireframes in the app's dark style).

## Why

In a real system design interview the first three steps (Requirements, Entities, API) produce artifacts the rest of the interview leans on: the requirements list, the entity model, the endpoint list. In Practice today those steps get only a small plain-text notes box in the right column (`PhaseNotes`), while the big canvas sits locked and empty until High-level design. The user wants a real place to write those artifacts in a structured, convenient way, and to go back and fix them later in the interview.

## Goals

- Each of the first three Practice steps gets its own **board** in the center area (where the locked canvas sits today):
  - **Requirements:** two lists, Functional and Non-functional.
  - **Entities:** boxes with a name and typed fields, connected by relationship lines with a chosen cardinality.
  - **API:** one card per endpoint with HTTP method, URL, request body JSON, response body JSON.
- **Jump between steps.** The step chips in the phase bar become clickable, so earlier boards can be opened and edited at any time.
- Boards are saved with the design, exported in the run bundle, and visible on the review screen.

## Non-goals

- No new board for High-level design or Deep dives. Those keep the existing simulation canvas.
- No validation of the artifacts (no checking the API against the entities, no grading of JSON shape, no schema inference).
- No change to Quick mode (it has no steps).
- No change to the step order or time budgets.
- No collaboration or sync (Interview mode is M11; today it falls back to the Practice layout and inherits these boards unchanged).

## Anti-goals (failure even if it technically works)

- Typing feels slower than the plain textarea it replaces. Adding a requirement, a field, or an endpoint should be keyboard-fast (Enter adds the next row).
- Going back to an earlier step silently messes up the interview clock.
- Losing what was already written: existing designs' free-text notes must still be there.
- Relationship lines that need text to be understood. The user explicitly does not want "many to many" written on lines.

## The boards

### Requirements (step 1)

- Two side-by-side columns: **Functional** and **Non-functional**.
- Each column is a list of one-line items. An item can be edited inline, dragged to reorder, and deleted. Enter at the end of an item adds a new item below it and focuses it. "+ add requirement" at the bottom does the same.
- **Non-functional starts pre-filled from the scenario** with the same values today's `nfrNotesTemplate` seeds: target load (RPS), p95 latency budget, max error rate, max consumer lag (when the scenario has it), consistency. Each such item shows a small "scenario" tag. They are ordinary items after seeding: editable and deletable. Seeding happens once per design, when the Non-functional list is empty and the design is attached (the same "after attach has loaded the saved record" gating `PhaseNotes` uses today). The state of the Requirements note doesn't matter. *(Assistant's call.)*
- **The notes template goes away.** New designs no longer get `nfrNotesTemplate` seeded into the Requirements notes box, because the list now holds those values. Existing notes are never converted into list items or rewritten. An old design whose note already holds the template keeps it, and also gets its Non-functional list seeded on first open (a harmless one-time duplicate, better than an empty list). *(Assistant's call.)*
- User confirmed: "requirements list is fine" (v2 mockup).

### Entities (step 2)

- A pannable/zoomable board with a dotted background, like the main canvas.
- **"+ Entity"** adds a box. A box has a **name** (header) and a list of **fields**, each a name plus a free-text type (`id uuid`, `email string`). "+ field" adds a field; Enter in a field adds the next one. Fields can be deleted and reordered.
- Boxes can be dragged around, deleted, and renamed.
- **Relationships:** drag from a box to another box to connect them. A connection has a **type**: one-to-one, one-to-many, many-to-one, many-to-many. The type is shown **only by the line ends** using crow's-foot notation (a bar for "one", a three-pronged foot for "many"), never by text on the line. Clicking a line opens a small picker of the four types drawn as icons. New lines default to one-to-many.
- Lines can be deleted. Self-relationships (a box to itself) are left to the builder.

### API (step 3)

- A vertical list of **endpoint cards**, with "+ Endpoint" at the top.
- Each card: an **HTTP method** picker (GET, POST, PUT, PATCH, DELETE, colored per method), a **URL** text field (monospace, `/v1/orders/{id}`), then **request body** and **response body** side by side as JSON text areas (monospace, light syntax coloring).
- The mockup also showed a **response status code** (→ 201) and a read-only list of the design's entity names in the right column. Both are the assistant's suggestions; the user said "endpoint good" to the mockup containing them, so they're in.
- Cards can be deleted and reordered.
- JSON is free text. Invalid JSON is allowed (this is a sketch) but should be visibly marked (for example a subtle "not valid JSON" hint), never blocking.
- User confirmed: "endpoint good".

### Notes stay

The existing free-text notes box (`PhaseNotes`) stays in the right column on every step, for anything that doesn't fit the board. Existing designs keep their notes.

## Moving between steps

- The step chips in `PhaseBar` become buttons.
- **Clicking an earlier (done) step opens its board for reading and editing. The interview clock keeps running for the step you're actually on** (user decision: "keep api timer running"). While viewing an earlier step, a visible way back is shown, for example a "← Back to API · 03:10" chip, and the phase bar shows which step you're viewing vs. which step the clock is on.
- **Clicking a later step works like Skip today:** the clock moves to that step and its timer starts. (Assistant's call, confirmed by "rest is fine".)
- In High-level design and Deep dives, the earlier boards remain one click away through the same chips, so the candidate can check entities/endpoints while building.
- **When a step's timer runs out, the board you're on stays put** (user decision). The clock auto-advances as today, but the center board doesn't switch under you. The board you were on now counts as an earlier step: the phase bar highlights the new current step and shows a "Go to Entities →" chip. The same applies if you're already viewing an earlier step when the clock crosses a boundary: the view stays and the chip updates. The viewed step changes only when the user clicks, never because of the clock.
- **Opening an earlier board during High-level design or Deep dives swaps only the canvas spot** (user decision). The board takes the canvas's place. The metrics bar, the pass/fail verdict and the replay scrubber stay visible. A running stress test keeps running. The component palette and node config panel hide while a board is shown, because there's no canvas to drop onto, and come back on return.
- The viewed step is UI state, not part of the persisted clock (`bp:phase:<id>` stays `{ phase, remainingSec, elapsedSec, running }`). A reload opens on the clock's current step.

## Saving, export, review

- Boards are part of the design and autosave like notes do today.
- They're included in the exported run bundle (`.breakpoint.json`) and survive import.
- The review screen shows them read-only so a grader can see the requirements, entity model and endpoints, and the markdown review report (`buildReviewReport`) includes them.
- Old designs and old bundles without boards load fine with empty boards (forgiving import, like the rest of `parseDesignRecord`).

## How it's built (decided)

- The Entities board uses **React Flow** (`@xyflow/react`), already a dependency. No new runtime dependencies; this stays inside the dependency budget in `app/CLAUDE.md`. The relationship line ends are custom edge markers drawn by us (assistant's call).
- Requirements and API boards are plain React components with Tailwind, matching the existing panels.
- The board data types are plain data. Where they live follows `05-engines.md` (likely `core` for the types, since persistence and the review report both need them).

## Left to the builder

- Exact data shapes (for example `DesignRecord.phaseArtifacts` or one field per step) and the name of the new field; update `02-data-model.md` with a Decisions line.
- Whether `RunBundle.version` needs a bump or stays 1 with forgiving defaults.
- Which `ActionKind`s board edits record in the action log (for example reusing a debounced "edited" action like notes do, or new kinds per board), so the review timeline shows when artifacts changed.
- Board layout details: entity box sizing, keyboard focus order, empty-state hints for each board.
- Self-relationships on the Entities board, and whether a line can be re-pointed by dragging its end.
- Whether field types get autocomplete suggestions (string, int, uuid, time, enum…).
- How the boards behave on small screens (Practice already shows `SmallScreenNotice`).
- Splitting into milestone tasks (this is likely its own milestone, `tasks/M13-…`).

## Decisions

- 2026-11-07: Relationship type is chosen from a picker and shown only by crow's-foot line ends; no text labels on lines (user).
- 2026-11-07: Jumping back to an earlier step doesn't move the clock; the current step's timer keeps running (user).
- 2026-11-07: Requirements are two lists, Functional and Non-functional, with Non-functional seeded from the scenario (user approved the mockup).
- 2026-11-07: API endpoint card = method + URL + status code + request JSON + response JSON (user approved the mockup).
- 2026-11-07: When a timer runs out, the viewed board stays and a "Go to <step> →" chip nudges; the view only changes on click (user).
- 2026-11-07: An earlier board opened in HLD/Deep dives replaces the canvas only; metrics, verdict and a running test stay live; palette and node config hide (user).
- 2026-11-07: Non-functional list replaces the notes template; old notes are never converted (assistant's call).
- 2026-11-07: High-level design and Deep dives keep the simulation canvas; no new boards there (assistant's call, user: "rest is fine").
