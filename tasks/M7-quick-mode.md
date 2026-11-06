---
tags: [milestone]
status: active
milestone: M7
depends-on: M6
---

# M7 — Quick mode (the new front door)

**Goal:** Split the product into modes and ship Quick simulation: one click from the landing page to a working starter design with a Run button and live traffic. Today's full flow becomes Practice mode, unchanged.

**Demo:** Open the landing page, click "Quick simulation", press Run, and watch traffic flow through Client → App server → SQL database. It passes. The nudge says "Now survive a 3× spike". Pick it, run again, and watch the app server go red. Add a replica and pass.

**Spec:** [[docs/superpowers/specs/2026-11-05-product-modes-design]]

## Tasks

### T-7.1 — Browser smoke test
- [x] T-7.1 done
  - Also edited beyond Files: `app/.gitignore`, `app/eslint.config.mjs`, `app/.prettierignore` (ignore Playwright output), `app/README.md`, `05-engines.md`, `01-architecture.md` (docs). Lockfile `libc` fields stripped by local npm 10.9 were restored.

**Files:** `app/e2e/smoke.spec.ts`, `app/playwright.config.ts`, `app/package.json`, `.github/workflows/ci.yml`
**Accept:** One Playwright test: open landing → open a design built from `examples/twitter.json` → press Run → a verdict appears and at least one node changes state. `npm run e2e` runs it locally, and CI runs it after `build`. `@playwright/test` (dev-only) gets a dependency-budget entry in [[05-engines]]. Lands first because M7 reshuffles the UI and nothing automated covers canvas → worker → HUD today.

### T-7.2 — Mode on the design record
- [x] T-7.2 done
  - Also touched: `tests/design-store.test.ts`, `tests/actions-store.test.ts`, LandingScreen/NodeConfigPanel/ReviewScreen call sites, `02-data-model.md`.

**Files:** `src/persistence/local.ts`, `src/stores/design-store.ts`, `tests/persistence.test.ts`
**Accept:** `DesignRecord.mode: "quick" | "practice" | "interview"`. Records and imports without the field load as `"practice"` (no migration). `buildDesignRecord` takes the mode. Export round-trips it. Engines (`src/lib/**`) stay mode-unaware.

### T-7.3 — Starter design + starter scenario
- [x] T-7.3 done
  - Starter graph lives in the shell (`src/components/quick/starter.ts`, + `QUICK_DESIGN_NAME`); Quick list = `QUICK_SCENARIOS` in `scenarios/index.ts`; `05-engines` extension row added.

**Files:** `src/lib/scenarios/presets/starter.json`, starter graph data (shell or scenarios engine, the plan decides), `tests/scenarios.test.ts`
**Accept:** Client → App server → SQL database, wired and configured. A gentle steady-load starter scenario (~30s). A test asserts `runSimulation(starter, starterScenario)` **passes**, so the first impression is green.

### T-7.4 — Landing page: three mode cards
- [x] T-7.4 done
  - Also added: `landing/new-design.ts`, `ModeBadge.tsx`, `styles.ts`, `tests/landing.test.ts`, `e2e/landing.spec.ts`; ScenarioCards copy; landing "Import design" (new design, file's mode); Quick rows have no Review link; new designs reset the global phase clock.

**Files:** `src/components/landing/LandingScreen.tsx`, new mode-card component
**Accept:** Three cards: Quick simulation (first, most prominent), Practice, and Interview (shown as "coming soon" until M11). Quick creates a design from the starter in one click (default name, no naming step) and opens it. Practice keeps today's create flow. The saved-designs list shows a mode badge per design. Run via `/ui`.

### T-7.5 — Quick mode workspace layout
- [ ] T-7.5 done

**Files:** `src/app/design/[id]/page.tsx`, new Quick layout component, `src/components/hud/MetricsBar.tsx`
**Accept:** `/design/[id]` renders by mode. Quick has no phase bar, phase notes, requirements panel, review link or canvas lock, and no action recording. The HUD is simplified to served RPS, p95 and error %, and the verdict uses plain language. Run is the visually dominant action. Scenario choice sits behind "More scenarios" and chaos behind "Break it"; both are hidden, not disabled. Practice renders exactly as today. Run via `/ui`.

### T-7.6 — Challenges + next-challenge nudge
- [ ] T-7.6 done

**Files:** challenge data (beside scenario presets), nudge card component, solved-state helper in `src/persistence/`
**Accept:** An ordered list of challenges as plain data (scenario id + one-line goal + optional hint): 3× spike, lose an app server, Black Friday, Celebrity tweet. After a run, a card suggests the next unsolved challenge, and picking it switches the scenario. All challenges are also listed. A pass marks the challenge solved in localStorage (per browser). Adding a challenge = adding a data entry.

### T-7.7 — Quick → Practice link + docs
- [ ] T-7.7 done

**Files:** Quick layout, `01-architecture.md`, `README.md`
**Accept:** Quick mode links to "Try a full practice interview", which starts a *new* Practice design (no conversion in v1). `01-architecture` describes the three modes and the new files, and the README status board is updated.

## Decisions

- 2026-11-05: Quick mode ships before the simulation fixes (M8), per product priority. Challenges are chosen so they work with today's engine (no queue-buffering challenge until M8).
- 2026-11-05: Desktop-only. No responsive layout or touch drag in M7; the existing `SmallScreenNotice` stays for Quick mode too.
- 2026-11-05 (T-7.1, lead call): restore the `libc` fields npm 10.9 stripped from existing lockfile entries, so the lockfile diff only adds Playwright — keeps CI's `npm ci` on other platforms unchanged.
- 2026-11-05 (T-7.2, lead call): `buildDesignRecord`'s `mode` is a required positional argument (no default), so no save path can silently write "practice" over a Quick design; unknown mode values load as "practice" like a missing one.
- 2026-11-05 (T-7.3, lead call): starter = 1 app-server replica at ~37% load under 1500 RPS steady (p95 30ms vs 200ms budget); the starter *graph* is shell data in `components/quick/starter.ts`, Quick scenarios a separate data list in the scenarios engine — a graph isn't a scenario, and the default name is UI copy.
- 2026-11-05 (T-7.4, lead call): the landing page gets an "Import design" button that always creates a new design keeping the file's mode — the spec's import rule assumes it, and without it an exported Quick design can't come back as Quick.
- 2026-11-05 (T-7.4, lead call): Quick default names are numbered when taken ("Quick simulation 2"); Practice keeps today's naming. Quick rows have no Review link (Quick has no review screen). Built-in stress tests move below "Your designs".
- 2026-11-05 (T-7.4, lead call): creating or importing a design from the landing page resets the global phase clock, so a new Practice design starts at Requirements instead of inheriting the last session's phase (pre-existing bug for *new* designs; opening an existing design still inherits it — backlog).
