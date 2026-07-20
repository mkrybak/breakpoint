---
tags: [milestone]
status: planning
milestone: M4
depends-on: M3
---

# M4 — Interview flow & human grading

**Goal:** Wrap the canvas+sim in the Hello Interview delivery framework, record everything the candidate does, and give a human grader a review screen: action timeline + sim replay + rubric scorecard.

**Demo:** Run a full 35-minute mock interview; then open the review screen as grader, scrub through what the candidate did minute-by-minute, fill the scorecard, save the report.

## Tasks

### T-4.1 — Phase flow + timers
- [x] T-4.1 done
  Deviation: also added `src/stores/phase-store.ts` (phase/timer state + lock rule) and a small edit to `src/components/canvas/DesignCanvas.tsx` (consumes the lock) — needed to lock the canvas cleanly; both shell, no boundary crossed (per plan's Context section).

**Files:** `src/app/design/[id]/page.tsx` (restructure), `src/components/panels/PhaseBar.tsx`
**Accept:** Phases: Requirements (5m) → Entities (2m) → API (5m) → High-level design (15m) → Deep dives + stress test (10m); phase bar with countdown, skip/extend; canvas locked until HLD phase (forces the framework discipline).

### T-4.2 — Phase notes capture
- [x] T-4.2 done
  Deviation: plan's Files list only named `PhaseNotes.tsx`, but persisting notes also required shell-only edits to `src/stores/design-store.ts` (hold/load/import/autosave `phaseNotes`), `src/persistence/local.ts` (`buildDesignRecord` optional `phaseNotes` param), `src/components/panels/NodeConfigPanel.tsx` (export), and `src/app/design/[id]/page.tsx` (mount) — per the plan's own Context section, no boundary crossed.

**Files:** `src/components/panels/PhaseNotes.tsx`
**Accept:** Markdown text areas per phase (functional reqs, NFRs, entities, API sketch); NFR phase pre-fills the RequirementsPanel values; all saved into `phase_notes` on the design.

### T-4.3 — Action timeline recorder
- [x] T-4.3 done
  Deviation: plan's Files list only named `recorder.ts` and hooks in `design-store.ts` / `sim-store.ts` / `PhaseNotes.tsx`, but wiring it up also required shell-only edits to `src/lib/actions/index.ts` (re-export the engine), `src/stores/phase-store.ts` (the `elapsedSec` interview clock), `src/persistence/local.ts` (`buildDesignRecord` optional `actionLog` param), and `src/components/panels/NodeConfigPanel.tsx` (export includes `actionLog`) — per the plan's own Context section, no boundary crossed.

**Files:** `src/lib/actions/recorder.ts`, hooks in `design-store.ts` / `sim-store.ts` / `PhaseNotes.tsx`
**Accept:** Every `ActionEvent` from [[02-data-model#ActionEvent — "watching what the candidate does"]] recorded with timestamp + phase (node/edge changes, config changes, note edits, phase transitions, sim runs, chaos injections); stored in `action_log`; unit test: scripted store mutations produce the exact expected event sequence.

### T-4.4 — Rubric + grader scorecard
- [x] T-4.4 done
  Deviation: plan's Files list only named `rubric.ts` and `Scorecard.tsx`, but making the scorecard load/save also required shell-only additions: `src/lib/grading/index.ts` (publish the engine), `src/persistence/scorecard.ts` (localStorage save/load + import guard), `src/stores/scorecard-store.ts` (working-scorecard state + debounced autosave), and three test files (`tests/grading.test.ts`, `tests/scorecard.test.ts`, `tests/scorecard-store.test.ts`) — per the plan's own Context section, no boundary crossed.

**Files:** `src/lib/grading/rubric.ts`, `src/components/review/Scorecard.tsx`
**Accept:** Rubric per phase with 1–5 anchors (e.g. Requirements: "top-3 prioritized, quantified NFRs" = 5); Scorecard renders rubric with score selectors + free-text feedback per phase + overall recommendation (strong hire → no hire); saves as `Scorecard` in localStorage (travels inside the `RunBundle` export from M5).

### T-4.5 — Review screen for the grader
- [x] T-4.5 done
  Deviation: plan's Files list only named `page.tsx` and `ActionTimeline.tsx`, but a working review screen also required shell-only additions: `ReviewScreen.tsx` (client orchestrator), `ReviewCanvas.tsx` (read-only canvas), `timeline.ts` (pure grouping), `src/persistence/report.ts` (markdown builder + download), an in-memory `actionSnapshots` field on `design-store.ts`, a nav link in `src/app/design/[id]/page.tsx`, and three test files — per the plan's own Context/Deviations section, no boundary crossed.

**Files:** `src/app/review/[runId]/page.tsx`, `src/components/review/ActionTimeline.tsx`
**Accept:** Three-pane review: (1) action timeline — chronological, grouped by phase, clicking an event restores the graph snapshot at that moment; (2) sim replay scrubber synced to the canvas; (3) scorecard. Read-only design view; phase notes visible per phase; export report as markdown.

## Decisions

- 2026-07-12: Grading is human-first — grader "watches" via recorded action timeline + replay, not live session. Live spectator mode = post-MVP. AI grading = far-future premium (same rubric/scorecard schema, add system grader).
