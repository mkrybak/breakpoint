---
tags: [spec, product, modes]
status: draft
created: 2026-11-05
---

# Product modes — Quick, Practice, Interview — design

## Why

Today Breakpoint has one way in: a blank canvas wrapped in the full interview
framework (five timed phases, canvas locked until High-level design, notes,
action recording, rubric). That is the right shape for a real interview, but a
heavy first contact for someone who just wants to *see what the simulation
does*. The simulation is the product's most distinctive part, and right now it
sits behind the most ceremony.

The fix is to split the product into three modes that share one engine and one
canvas, and differ only in how much framing surrounds them:

| Mode | Who | What they want |
|---|---|---|
| **Quick simulation** | Anyone, first visit | Press Run, watch traffic flow, break things, learn by tinkering |
| **Practice** | One person preparing for interviews | The full structured interview, alone, then review themselves |
| **Interview** | A real interviewer + a candidate | Both open the same session and see the design change live |

Quick mode is the new front door and ships first.

## Goals

- A first-time visitor sees traffic moving through a working design within one
  click of the landing page.
- The three modes are clearly separated: advanced interview features never
  appear in Quick mode, and nothing about Quick mode leaks into Practice.
- Today's full flow keeps working, unchanged, as Practice mode.
- Interview mode gives interviewer and candidate one shared, live session.

## Non-goals

- AI feedback or AI grading in any mode (parked; see [[04-roadmap]]).
- Converting a design from one mode to another in v1 (see "Moving between
  modes").
- Accounts or login for Quick and Practice; they stay local-first.
- Phone and tablet support. Quick mode is desktop-only like the rest of the
  workspace; the existing small-screen notice stays (decided 2026-11-05).

## Anti-goals (failure even if it technically works)

- Quick mode that still feels like a form: if the user has to pick a scenario,
  set NFRs, or read instructions before seeing traffic move, it failed.
- Hiding advanced features by *disabling* them in place (greyed-out panels).
  Quick mode should look like a smaller, simpler product, not a crippled one.
- Forking the canvas or simulation per mode. One canvas, one engine; modes are
  a shell concern.

## Feature matrix

| Feature | Quick | Practice | Interview |
|---|---|---|---|
| Starter design preloaded | ✓ | — (blank, or a problem's starting point once M10 lands) | — |
| Palette, canvas, node config | ✓ | ✓ | candidate edits; interviewer watches |
| Run button + live node/edge visualization | ✓ (prominent) | ✓ | ✓ |
| HUD | simplified: served RPS, p95, error % | full | full |
| Verdict | ✓ (plain-language) | ✓ | ✓ |
| Event log | ✓ | ✓ | ✓ |
| Replay scrubber | ✓ | ✓ | ✓ |
| Scenario picker | tucked away ("More scenarios") | ✓ | interviewer chooses |
| Requirements (NFR) editing | hidden (scenario defaults apply) | ✓ | interviewer only |
| Chaos buttons | tucked away ("Break it" menu) | ✓ | interviewer only |
| Next-challenge nudge | ✓ | — | — |
| Phases, timers, canvas lock | — | ✓ | ✓ (interviewer runs the clock) |
| Phase notes | — | ✓ | candidate notes shared; interviewer has private notes too |
| Action timeline recording | — | ✓ | ✓ |
| Review screen + scorecard | — | self-review | interviewer grades |

## Quick mode

**Entry.** The landing page leads with three mode cards; Quick simulation is
the first and most prominent. One click creates a new Quick design from the
starter and opens it, with no naming step (it gets a default name and appears in the
saved-designs list with a "Quick" badge).

**Starter design.** Client → App server → SQL database, wired and configured,
with a gentle starter scenario (steady load, ~30s) selected. The starter
**passes** on its first run (healthy, green), so the first impression is
"this is what traffic looks like", not a failure.

**The screen.** Canvas in the centre, palette on the left, a big Run button,
and a simplified HUD. No phase bar, no notes, no requirements panel, no review
link. Scenario choice and chaos buttons exist but are tucked behind
"More scenarios" and "Break it" so they don't compete with Run.

**Next-challenge nudge.** After a run, a small card suggests the next thing to
try ("Now survive a 3× traffic spike"). Picking it switches the scenario and
the user re-runs. Challenges are an ordered list of plain data (scenario + a
one-line goal + an optional hint), e.g.:

1. Survive a 3× spike
2. Lose one app server without errors
3. Black Friday
4. Celebrity tweet

All challenges are visible; the nudge just suggests the next unsolved one.
Solved state is per-browser (localStorage).

## Practice mode

Exactly today's flow: phases with timers and canvas lock, phase notes,
requirements panel, scenario and chaos controls, action recording, review
screen with replay, timeline and scorecard. The scorecard is filled by the
candidate themselves (self-review). Later milestones deepen it (problem bank,
"par" cost, share by link) but the shape stays.

## Interview mode

**Shape.** The interviewer creates a session and gets a candidate link. Both
browsers show the same design, updating live. The candidate builds; the
interviewer runs the phase clock, sets requirements, picks the scenario,
fires chaos and surprise stress events, keeps private notes, and fills the
scorecard. The candidate never sees interviewer-only content.

**What it costs.** This is the first feature that needs a server: a realtime
sync service for shared sessions. It reverses the 2026-07-12 "no server state"
decision *for Interview mode only*; Quick and Practice stay fully local.
Technology, identity (likely "possessing the link = your role", no accounts),
session lifetime and what is stored server-side are decided in a design spike
at the start of M11, not here.

**After the session.** Either side can export the run bundle; the existing
review screen works on it as today.

## Moving between modes

v1 keeps modes separate: a design has one mode for its whole life. Quick mode
links to "Try a full practice interview", which starts a *new* Practice design.
(Converting a built Quick design into Practice clashes with the phase rules,
since the canvas is locked until High-level design, so it is deferred.)

## How it's built (decided)

- **Mode is data on the design.** `DesignRecord` gains
  `mode: "quick" | "practice" | "interview"`. Records without it (everything saved
  before this change) load as `"practice"`. Import accepts the field optionally;
  no migration.
- **Same route.** `/design/[id]` reads the record's mode and renders the
  matching layout. No per-mode routes for the workspace.
- **Modes are a shell concern.** Engines (`src/lib/**`) don't know modes
  exist. The starter design and challenge list are plain data; challenges are
  scenarios plus copy, so they live alongside scenario presets.
- **Quick mode doesn't record actions** and has no review screen.
- **Quick scenarios are their own list.** The starter scenario and every
  challenge scenario live in a Quick-only list, separate from the shared
  presets that Practice's picker and the landing page's "Built-in stress
  tests" show. Practice is unchanged. Quick's "More scenarios" shows only the
  starter plus the challenges. Challenges 3–4 are *gentler Quick versions* of
  Black Friday and Celebrity tweet, not the Practice presets, and each one has
  a test proving a reasonable design can beat it. *(My call.)*
- **`"interview"` is in the `mode` type from M7.** Until M11 the landing card
  shows "coming soon" (that's a roadmap teaser, not a disabled feature, so the
  "no greyed-out panels" anti-goal doesn't apply). A record that somehow
  arrives with `mode: "interview"` before M11 opens in the Practice layout
  with a one-line notice. *(My call.)*
- **Importing never converts a mode.** The workspace's in-place "Import JSON"
  keeps the current design's mode and ignores the file's. Importing from the
  landing page creates a new design with the file's mode (or `"practice"` if
  it's missing). Quick keeps design export/import but has no run-bundle export
  and no review screen. *(My call.)*

## Left to the builder

- Exact visual design of the landing mode cards and the Quick layout (goes
  through `/ui` review in the browser).
- The starter scenario's exact numbers, as long as the starter design passes it.
- Copy for challenges, hints and the plain-language verdict.
- Where the "More scenarios" / "Break it" controls sit, as long as Run stays
  the visually dominant action.

## Decisions

- 2026-11-05: Three modes (Quick / Practice / Interview), Quick ships first.
  AI feedback postponed indefinitely.
- 2026-11-05: Interview mode = both parties live in one shared session (not
  screen-share). Accepts a backend for this mode only.
- 2026-11-05 (my call, reviewable): no mode conversion in v1; old records
  default to Practice; starter design passes its first run; challenges all
  visible with a suggested next one; Quick-only scenario list; import never
  converts a mode; `"interview"` in the type from day one.
- Roadmap placement: M7 (Quick), M10 (problem bank), M11 (Interview). See
  [[tasks/backlog]].
