---
tags: [milestone]
status: planning
milestone: M10
depends-on: M9
---

# M10 — Practice depth

**Goal:** Turn Practice mode into "LeetCode for system design": a bank of problems with hidden stress events and a par cost, a useful self-review, and designs you can share by link.

**Demo:** Start Practice and pick "Design a URL shortener". Go through the phases, then run. A surprise hot-key event hits; you pass, but at 2× par cost. The self-review shows where it broke and what it cost. Copy a share link and open it in another browser to get a copy of the design.

## Tasks

### T-10.1 — Problem schema + first problems
- [ ] T-10.1 done

**Files:** problem data + schema guard (in `src/lib/scenarios/` or a new data folder, the plan decides), `src/lib/core/`
**Accept:** A `Problem` = prompt, functional requirements, NFRs (a scenario), **hidden** stress events (merged into the timeline at run time and not shown up front), and a par cost (from M9). Five problems: URL shortener, chat (WebSocket gateway), news feed, ticket booking (strong consistency), video upload (blob + async). Adding a problem = adding a data file.

### T-10.2 — Practice from a problem
- [ ] T-10.2 done

**Files:** landing Practice card, `src/components/panels/PhaseNotes.tsx`, `src/components/panels/RequirementsPanel.tsx`
**Accept:** Practice start offers "Pick a problem" or "Blank". The prompt shows during the Requirements phase. NFRs come from the problem. Hidden events reveal themselves in the event log only once they fire, and are listed in the review afterwards.

### T-10.3 — Self-review
- [ ] T-10.3 done

**Files:** `src/components/review/ReviewScreen.tsx`, `src/components/review/Scorecard.tsx`
**Accept:** In Practice the review screen is framed as self-review: the user scores themselves against the same rubric. A summary card shows pass/fail per requirement, where it broke (first failure + node), and cost vs par. Interview-only wording ("hire / no hire") is hidden in Practice.

### T-10.4 — Share a design by link
- [ ] T-10.4 done

**Files:** `src/persistence/` share helper, a share route or hash handler
**Accept:** "Copy link" encodes the design (+ scenario id) into the URL hash, compressed with the native `CompressionStream` (no new dependency, no backend). Opening the link shows a read-only preview with "Make a copy", which saves a local design. Links stay under common URL length limits for typical designs (tested with `examples/twitter.json`). It works for Quick and Practice designs.

## Decisions

- (log deviations here)
