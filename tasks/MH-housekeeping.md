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

## Decisions

- (log deviations here)
