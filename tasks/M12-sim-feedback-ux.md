---
tags: [milestone]
status: planning
milestone: M12
depends-on: M8
---

# M12 — Sim feedback UX

**Goal:** Make what the sim does with M8's features (breakers, retries, honest p95) readable. Today they work but can look broken: a breaker that saved the dependency still shows a bare "Failed", the log says "recovered" while the breaker hides the node, and a retry storm is invisible on the canvas. Source: lead review after `/build T-8.4..T-8.7` (2026-11-07).

**Demo:** Run "3× traffic spike" on `examples/retry-storm.json` with retries 3 and no breaker. The edge chip shows the amplification (`↻ 3.4× load`). Tick the breaker and re-run. The log reads "idle (breaker open)" rather than "recovered", the verdict credits the breaker and names the remaining fix, and clicking p95 shows which node drives the tail. Scrub the replay into the open window and the HUD shows that moment's numbers.

Run UI tasks via `/ui` or `/build` (screenshots required).

## Tasks

### T-12.1 — Verdict and hint understand breakers
- [x] T-12.1 done
  - Also: new optional `EdgeFrame.failedFastRps` + `Verdict.breakerTrips` (reporting only, no sim numbers change); wording helpers in `hud-format.ts`; one-line `ChallengeCard.tsx` change; `scripts/sim.ts` prints a breaker summary line.

**Files:** `src/components/hud/Verdict.tsx`, `src/components/quick/challenge-nudge.ts`, `src/lib/simulation/verdict.ts` (advisory facts only)
**Accept:** When a run fails on errors and some of those errors were fail-fast rejections by an open breaker, the verdict says so: which breaker, how many requests it failed fast, and whether its target recovered (e.g. "Your breaker protected Payments API (recovered at 21 s), but 9k requests failed fast while it was open. Add capacity so it doesn't trip."). The challenge nudge stops suggesting a fix the user already made, and points at capacity behind the breaker instead. The verdict facts come from frames; no new engine behaviour.

### T-12.2 — Event log tells the truth around breakers
- [x] T-12.2 done
  - Also: a held line released after its own tick carries its real time (" at 21.1s", lead call); `breaker.ts` gains `canReopenWithin`/`breakerReopenedEvent`/`logTimeSuffix`; T-8.5 retry-storm-with-breaker golden updated for the stamp.

**Files:** `src/lib/simulation/node-models.ts` (`transitionMessage`), `src/lib/simulation/engine.ts` (event order), `src/components/hud/hud-format.ts` (`classifyLogSeverity`), `tests/engine.test.ts`
**Accept:** A node whose load drops because an upstream breaker opened logs "X idle (breaker open)" (neutral), not a green "X recovered". "Recovered" is logged only when the node serves real traffic again. A breaker that re-opens within 1 s of closing logs one line ("breaker re-opened 0.5 s after closing") instead of a closed/overloaded/open burst. Update the T-8.6 golden event timeline, and record old → new lines in Decisions.

### T-12.3 — Resilience visible on the canvas
- [x] T-12.3 done
  - Also: `supportsResilience` derived on `FlowEdgeData`; chip text in new `edge-chip.ts`; the stopwatch is `⏱` + U+FE0E (lead fix after screenshots).

**Files:** `src/components/canvas/edges/FlowEdge.tsx`, `src/stores/flow-adapter.ts`
**Accept:** The idle edge chip shows the edge's settings compactly (`⏱200 ↻3`, plus the existing breaker suffix). While running, an edge with retries shows its amplification (attempts ÷ fresh calls, e.g. `↻ 3.4× load`, amber above 1.5×) from `perEdge.retryRps`/`rps`. It's readable without selecting the edge, and replay scrubbing updates it.

### T-12.4 — Short edges stay readable
- [x] T-12.4 done
  - Also: pure layout rules in new `edge-layout.ts`; collapsed badge has a muted timer icon for edges with settings (lead override). Follow-up: React Flow's arrowhead scales with stroke width and eats most of a 68px edge under load.

**Files:** `src/components/canvas/edges/FlowEdge.tsx`
**Accept:** On an edge too short for its label, the open popover sits beside the edge rather than covering the target node's label, and the chip collapses to an icon so the edge stroke (including the rose "breaker open" stroke) stays visible. Screenshots: the seeded `retry-storm.json` layout, with no node dragging.

### T-12.5 — p95 explains itself
- [x] T-12.5 done
  - Also: new `persistence/notices.ts` (one-time note key), `hud-format.ts` hint copy + `topP95Contributors`, new `e2e/p95-popover.spec.ts`; Queue lag card got the hint popover too; "Got it" sized to 32px.

**Files:** `src/components/hud/MetricsBar.tsx`, `src/lib/simulation/engine.ts` (per-node tail contribution on the frame, optional field), `src/lib/core/sim-result.ts`
**Accept:** Clicking the p95 card opens a small popover (works on touch, replaces reliance on the native `title`) with the one-line explanation and the top 3 nodes by contribution to the tail, from T-8.7's moment fold. The first time a user who has saved designs sees the new p95 model, a one-time dismissible note says p95 is now more realistic: tails grow faster as components get busy. Errors and Lag cards get the same dotted-underline hint affordance as p95.

### T-12.6 — Replay HUD follows the scrubber
- [x] T-12.6 done
  - Also: `ReplayScrubber.tsx` untouched (the scrubber already repoints `latestFrame`); `bottleneckOf`/`displayAggregates`/`selectDisplayFrame` in `sim-store.ts`. Follow-up: Bottleneck sub prints raw util above 100% (e.g. 1610.2%).

**Files:** `src/components/hud/MetricsBar.tsx`, `src/components/hud/ReplayScrubber.tsx`, `src/stores/sim-store.ts`
**Accept:** While scrubbing a finished run, the HUD cards show the scrubbed frame's values (p95, errors, served, lag, bottleneck), matching the canvas. Releasing to the end shows the end-of-run values. "peak" subs keep showing the whole-run peak.

### T-12.7 — Small polish
- [x] T-12.7 done
  - Also (planned deviation): new `persistence/phase-clock.ts`, `local.ts` `deleteDesign` clears `bp:phase:<id>`, a `design-store.ts` guard, shared `INPUT`/`FIELD_LABEL` in `RequirementsPanel`/`ScenarioPanel`, new `e2e/practice-phase.spec.ts`.

**Files:** `src/components/panels/styles.ts`, `src/stores/phase-store.ts`, `src/components/panels/PhaseBar.tsx`
**Accept:** Panel inputs (`INPUT`) get a visible focus ring and a 32px min height. The Practice phase survives a reload: the canvas isn't re-locked behind "High-level design" after a refresh.

### T-12.8 — Right sidebar only when it's needed
- [x] T-12.8 done
  - Also: new `stores/design-file-store.ts` + `panels/DesignFileMenu.tsx`, `DesignCanvas.tsx` handles the file drop, `MenuButton` gains `iconOnly`/`align`; the inspector × and the import-alert dismiss are 32px (plan said 24px / bare icon).

**Files:** `src/components/panels/NodeConfigPanel.tsx`, `src/components/layout/PracticeWorkspace.tsx`, `src/components/quick/QuickWorkspace.tsx`, `src/components/quick/QuickMenus.tsx` (or a shared top-bar menu)
**Accept:** The right inspector column (Design / Node / Edge) isn't a permanent ~250px strip. With nothing selected it is hidden (or collapsed to a thin rail), and the canvas gets the width. Selecting a node or edge opens it; deselecting closes it. Export JSON / Import JSON move out of the sidebar into a top-bar menu (a "⋯" / File menu) in both Quick and Practice; import still accepts a dropped file. The open/close doesn't jump the canvas viewport. Screenshots at 1440×900 and 1280×800, before and after, for both modes. Source: user feedback 2026-11-07 ("right sidebar takes a lot of space, export/import isn't always needed").

## Decisions

- (log deviations here)
- 2026-11-07 (T-12.1): one optional frame field was needed — `EdgeFrame.failedFastRps` (reporting only) — because frames couldn't separate a breaker's fail-fast rejections from the source's own drops; touches `engine.ts` and `core/sim-result.ts` beyond the Files list. The facts are a structured `Verdict.breakerTrips?` rather than advisory strings (the full Verdict shows advisories only on a pass, the plain variant drops them, and the nudge needs the target label). Gating is in the shell (`breakerTripsBehindErrors`): breaker lines show only on a failed run with an `error-rate`/`kill-survival` failure, and in the plain verdict they replace the generic capacity tip. Copy helpers live in `hud-format.ts`; the hint swap lands in `challenge-nudge.ts` + one expression in `ChallengeCard.tsx`. Grader report unchanged.
- 2026-11-07 (T-12.1, lead call): breaker facts are a structured `Verdict.breakerTrips` field built from frames (not log text, since T-12.2 may delay log lines). "Recovered at" = start of the final unbroken closed stretch. Only breakers on the client's sync path count. When a breaker line shows, Quick's generic capacity tip is dropped.
- T-12.2: T-8.6 outage golden, old → new. Breaker-filtered `[14 open, 65 half-open, 65 open, 116 half-open, 116 "app → dep breaker closed — traffic restored"]` becomes the full timeline `[10 "dep down", 14 open, 65 half-open, 65 open, 80 "dep idle (breaker open)" (was 80 "dep recovered"), 116 half-open, 122 "app → dep breaker closed at 11.6s — traffic restored", 122 "dep recovered at 11.7s"]`. Quick spike (App server → Payments API, timeout 100, retries 3, breaker):
  - 10.5 "Payments API recovered" → "Payments API idle (breaker open)".
  - 15.5 closed + 15.6 overloaded + 16.0 "open at 97%" + 16.1 recovered → 16.0 "App server → Payments API breaker re-opened 0.5 s after closing".
  - 21.1 closed → 21.7 "App server → Payments API breaker closed at 21.1s — traffic restored" + 21.7 "Payments API recovered at 21.2s".

  Call: a genuine close logs late, by up to the time a re-trip stays possible: 0.6 s at the default 0.5 s trip window, 0 s for trip windows over 1 s. Lead call: a line released late carries its real time (" at 21.1s" after the state word); released on its own tick it keeps the plain wording. T-8.5 retry-storm-with-breaker golden: last line `… closed — traffic restored` → `… closed at 6.5s — traffic restored`. Severity: idle = info, re-opened = warning. Placeholder line kept (T-12.1 appended below it too).
- 2026-11-07 (T-12.3): edge chip amplification = rps ÷ (rps − retryRps) per frame, unclamped (retry-storm spike: 3.6× sustained, one 8.9× frame as the spike ends); shown only when it rounds above 1.0×, amber above 1.5×. Timeout shows ms below 1 s, else seconds (`⏱1.5s`). Settings/breaker show only where edgeSupportsResilience holds (derived `supportsResilience` on FlowEdgeData). Chip text lives in `components/canvas/edges/edge-chip.ts`.
- 2026-11-07 (T-12.3, lead call): the chip's stopwatch is written `⏱` + U+FE0E (text presentation). Without it Chromium draws a white colour-emoji stopwatch that is heavier than the 10px mono chip. T-12.4's `chipWidth` ignores U+FE0E.
- 2026-11-07 (T-12.4): short edges. The chip collapses to a state icon when its estimated width (6 px/char + 12) plus 10 px of stroke each side exceeds the handle-to-handle span (retry-storm 68 px, starter 98 px). Icon priority: breaker open (rose) > probing (amber) > hot amplification (Repeat + "3.6×", so the M12 demo stays readable) > resilience settings (muted Timer, lead call: a collapsed chip must not hide that the edge has timeout/retries) > ellipsis. The open edge editor moves below both endpoint nodes when its estimated 210/250 × 32 box would overlap either. Helpers in `components/canvas/edges/edge-layout.ts`. Spans under ~40 px still lose most of the stroke to the icon (accepted).
- 2026-11-07 (T-12.5): the p95 popover lists the frame's top 3 nodes as "ms · % of p95" (from the engine's `SimFrame.p95ByNode`, mean share + 2σ tail share, summing to p95), not a pure σ share, so users can add them up. In M/M/1 σ = mean per node, so the ranking is the same either way. Measured: `examples/retry-storm.json` × "3× traffic spike" peaks at t = 20 s with p95 2289.34 ms = Dependency 2279.09 (99.6%) + App fleet 9.25 + Client 1.01; Σ entries is within 0.011 ms of p95 on all 300 frames. The one-time "new p95 model" note shows only to a browser holding a design saved before T-8.7 landed (`updatedAt` < `2026-11-07T07:19:55.000Z`, commit 56262f1), since the landing page saves a record on create and "now more realistic" means nothing to a new user. Eligibility is read once at HUD mount, before any autosave can bump `updatedAt`. The note shows while a run is live and is dismissed by "Got it" or by opening the p95 popover; key `bp:notes:p95-model` = `"dismissed"`. The Metric `title` prop is gone: Errors, Lag, Queue lag and simple Errors are hint cards (dotted label + click/tap popover) with their old copy moved unchanged into `hud-format.ts` constants; simple Errors uses the full bar's text.
- 2026-11-07 (T-12.7): phase clock persisted per design (`bp:phase:<id>`, new `src/persistence/phase-clock.ts`). `PhaseBar` attaches/detaches it. design-store records `phase_started` only for the attached design's own clock, which also fixes landing's `reset()` logging 'entered requirements' into the previously opened design. `RequirementsPanel`/`ScenarioPanel` now use the shared `INPUT`/`FIELD_LABEL`.
- T-12.8: inspector hidden (not a rail) with nothing selected; opens as a column beside the canvas below the metrics bar (no overlay: it would cover the verdict at 1280 px); React Flow keeps its transform on resize, so no viewport jump. Export/Import moved to an icon-only "Design file" ⋯ menu at the right end of the metrics bar (both modes); a .json dropped on the canvas imports, ignoring the canvas lock like the old button.
- 2026-11-07 (T-12.5, lead call): the Queue lag card gets the same hint popover as Errors/Lag. The breakdown header keeps the time in normal case ("at 29.9s"). Screenshot seeds use localStorage because Import JSON rejects the bare-graph `examples/*.json` files.
- 2026-11-07 (T-12.6, lead call): `Verdict.tsx`'s `result.frames.at(-1)` stays: it measures run length, not "now". The Practice screenshots use Black Friday at base 1500 RPS because the 3× spike is a Quick-only preset.
- 2026-11-07 (T-12.8, lead call): the inspector × and the import-error dismiss are 32px targets (the plan said 24px / a bare icon), per the 32px floor. The e2e alert locator filters by text because Next's route announcer is also `role="alert"`.
