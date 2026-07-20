---
tags: [milestone]
status: planning
milestone: M5
depends-on: M4
---

# M5 — Export/import & deploy

**Goal:** From local toy to shareable product — designs survive reload, runs travel as files between candidate and grader, app lives behind a URL. No accounts, no server state (decision 2026-07-12, see [[01-architecture]] Decisions).

**Demo:** On the live URL: complete an interview, export the run bundle, open the review screen in a fresh browser profile, import the bundle, grade it, export the graded report. Reload mid-interview and nothing is lost.

## Tasks

### T-5.1 — localStorage autosave
- [x] T-5.1 done

**Files:** `src/persistence/local.ts`, hooks in `design-store.ts`
**Accept:** `DesignRecord` from [[02-data-model#Persistence (local-first, no DB — decision 2026-07-12)]] autosaved (debounced) on every graph/notes/config change under `bp:design:<id>`; landing page lists saved designs; delete + rename; survives reload mid-interview.

Deviation: autosave/reload-survival were already delivered by T-1.5/M4 (no `design-store.ts` edit needed); this task added `listDesigns`/`deleteDesign`/`renameDesign` in `local.ts`, `src/components/landing/LandingScreen.tsx`, and rewired `src/app/page.tsx` + `layout.tsx` metadata. Also: the plan's `LandingScreen` effect (`setDesigns(listDesigns())` on mount) failed `react-hooks/set-state-in-effect`, a lint rule the plan didn't anticipate — kept the plan's SSR-hydration-safe code as-is and suppressed the rule on that line (a lazy `useState` initializer was considered but rejected: it would run on the client's hydration pass too, mismatching the server-rendered `null` state).

### T-5.2 — Run bundle export/import
- [x] T-5.2 done

**Files:** `src/persistence/local.ts`, `src/components/review/ImportDropzone.tsx`
**Accept:** Export `<name>.breakpoint.json` (`RunBundle`: design + frozen scenario + result + optional scorecard); review screen imports via file picker/drag-drop; hand-rolled schema guard rejects malformed bundles with a readable error; grader re-exports with scorecard filled; round-trip test: export → import → identical replay.

Deviation: the Files list names only `src/persistence/local.ts` and `src/components/review/ImportDropzone.tsx`, but a reviewable import also required shell-only edits — a new `sim-store.loadResult` (frames aren't persisted, so the review screen has no other source for an imported run's replay), the Export-bundle button + import empty-state in `ReviewScreen.tsx`, and tests in `tests/persistence.test.ts`. No engine boundary crossed. The `(T-5.2 planning)` Decisions entry was already added to `02-data-model.md`.

### T-5.3 — Deploy + CI
- [x] T-5.3 done

**Files:** `.github/workflows/ci.yml`, `app/README.md`, host config
**Accept:** CI runs lint+typecheck+tests (incl. golden sim tests) on push; app deployed to a live URL (Vercel or equivalent — stateless, nothing to operate); environment documented in `app/README.md`.

Deviation: workflow lives at `app/.github/workflows/ci.yml` (git root is `app/`, not the vault root); README rewritten wholesale. "Host config" = zero-config Vercel — no `vercel.json`, host setup is a dashboard runbook in the README instead, since deploying is account-bound and manual (no git remote configured yet). `next.config.ts` intentionally left untouched (Next 16's `next build` no longer lints, so no double-lint concern). CI targets Node 22 to match Vercel's runtime. No engine boundary or app code touched. The actual push-to-GitHub and Vercel import (which produce the live URL) are outstanding manual user steps.

### T-5.4 — Polish pass
- [ ] T-5.4 done

**Files:** various
**Accept:** Landing page with scenario cards; empty states; error boundaries; mobile at least readable; run through full flow twice with fresh eyes and file bugs as new checkboxes here.

## Decisions

- 2026-07-12: Rewritten — DB/auth milestone (Drizzle schema, persistence API, Auth.js, dockerized deploy) replaced by local-first export/import after dropping the database entirely.
