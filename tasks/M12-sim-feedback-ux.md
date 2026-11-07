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
- [ ] T-12.5 done

**Files:** `src/components/hud/MetricsBar.tsx`, `src/lib/simulation/engine.ts` (per-node tail contribution on the frame, optional field), `src/lib/core/sim-result.ts`
**Accept:** Clicking the p95 card opens a small popover (works on touch, replaces reliance on the native `title`) with the one-line explanation and the top 3 nodes by contribution to the tail, from T-8.7's moment fold. The first time a user who has saved designs sees the new p95 model, a one-time dismissible note says p95 is now more realistic: tails grow faster as components get busy. Errors and Lag cards get the same dotted-underline hint affordance as p95.

### T-12.6 — Replay HUD follows the scrubber
- [ ] T-12.6 done

**Files:** `src/components/hud/MetricsBar.tsx`, `src/components/hud/ReplayScrubber.tsx`, `src/stores/sim-store.ts`
**Accept:** While scrubbing a finished run, the HUD cards show the scrubbed frame's values (p95, errors, served, lag, bottleneck), matching the canvas. Releasing to the end shows the end-of-run values. "peak" subs keep showing the whole-run peak.

### T-12.7 — Small polish
- [ ] T-12.7 done

**Files:** `src/components/panels/styles.ts`, `src/stores/phase-store.ts`, `src/components/panels/PhaseBar.tsx`
**Accept:** Panel inputs (`INPUT`) get a visible focus ring and a 32px min height. The Practice phase survives a reload: the canvas isn't re-locked behind "High-level design" after a refresh.

### T-12.8 — Right sidebar only when it's needed
- [ ] T-12.8 done

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
