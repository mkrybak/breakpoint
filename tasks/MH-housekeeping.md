---
tags: [milestone]
status: planning
milestone: MH
depends-on: none
---

# MH — Housekeeping (slot in anywhere)

**Goal:** Keep the vault truthful and the process light. These tasks have no ordering and can be picked up between milestone tasks. Commit prefix: `chore:` / `docs:`.

## Tasks

### H-1 — Fix docs drift
- [ ] H-1 done

**Files:** `app/README.md`, `01-architecture.md`, `02-data-model.md`, `03-simulation-engine.md`, `05-engines.md`
**Accept:**
- `app/README.md` no longer says `app/` is the git repository root (lines 11 and 64); it has been the vault root since the monorepo merge.
- Built specs have `status:` frontmatter that matches reality (they all say `planning`).
- `01-architecture` repo layout matches the code (e.g. `GroupNode.tsx` is listed but not built until T-9.3).

### H-2 — Lighten the planning artifacts
- [ ] H-2 done

**Files:** `plans/`, `process/claude-workflow.md`, `.claude/commands/plan.md`
**Accept:** Plans for committed tasks are removed or moved to `plans/archive/` (git history keeps them; [[process/claude-workflow]] already calls them disposable). `/plan` gets a size guideline so routine tasks don't produce 1,000-line plans. Spec Decisions entries stay ADR-sized: decision, why, consequence. Today plans are ~18k lines against ~6.7k lines of source.

### H-3 — Usage signal on the live site
- [ ] H-3 done

**Files:** `app/src/app/layout.tsx`, `05-engines.md` (dependency budget)
**Accept:** Privacy-friendly page and event analytics (e.g. Vercel Web Analytics, or a no-cookie alternative) with a handful of events: mode chosen, run pressed, challenge solved, design shared. A visible feedback link. Dependency-budget entry written.

### H-4 — 32 px hit targets in the phase bar and review header
- [ ] H-4 done

**Files:** `app/src/components/panels/PhaseBar.tsx`, `app/src/components/review/ReviewScreen.tsx`, `app/src/components/boards/entities/` (toolbar, field and box buttons)
**Accept:** Step chips, the back/nudge chip, Pause / +1m / Skip, the review tabs and header buttons, and the Entities board's "+ Entity", "+ field" and delete buttons are at least 32 px tall (the design standard's floor). Today they're ~26 px (follow-up from M13, see [[tasks/M13-practice-step-boards]] Decisions). The phase bar still fits on one line at 1280 px, return chip included. Screenshots before/after.

### H-5 — No page scroll in the Practice workspace at 1440×900
- [ ] H-5 done

**Files:** `app/src/components/layout/PracticeWorkspace.tsx`, `app/src/components/hud/EventLog.tsx`
**Accept:** At 1440×900 (and 1280×800) the page itself never scrolls: the right column's Event Log stays inside the viewport and the column above it scrolls on its own. Today the page scrolls ~48 px (noticed during M13; predates it).

### H-6 — Readable entity diagram on the review screen at small viewports
- [ ] H-6 done

**Files:** `app/src/components/boards/entities/EntitiesBoard.tsx` (read-only mode)
**Accept:** On the review screen's Entities tab at 1280×800, a 3-box diagram is readable without zooming: box text and crow's-foot ends are at least as large as on the editing board (today `fitView` with `maxZoom: 1` shrinks it to ~0.75). Pan/zoom still work.

## Decisions

- (log deviations here)
