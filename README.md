---
tags: [project, breakpoint]
status: active
created: 2026-07-12
---

# Breakpoint

*Every design has one. Find yours before the interview does.*

A platform for running system design interviews the way they actually work (Hello Interview delivery framework): candidate builds a design on a canvas, interviewer sets non-functional requirements (e.g. 5k RPS, strong consistency, p95 < 500ms), and a **live stress-test simulation** shows in realtime what holds and what breaks.

## Core idea

The design is not a drawing — it's a typed graph (React Flow JSON). That makes it:

1. **Renderable** — beautiful custom nodes per component type (DB, cache, queue, LB, CDN...)
2. **Simulatable** — a tick loop propagates traffic through the graph; each node has capacity/latency metadata from real 2026 hardware numbers
3. **Gradable** — deterministic rules check the hard requirements; a **human grader** scores the soft parts (requirement prioritization, API design, trade-off reasoning) against a rubric, by watching what the candidate did: recorded action timeline + sim replay. AI grading via Claude API is a far-future premium feature, not MVP.

## Vault map

| Note | Purpose |
|---|---|
| [[01-architecture]] | Stack decisions, system diagram, full repo file breakdown |
| [[02-data-model]] | TypeScript types + persistence shapes (component registry, graph, scenarios) |
| [[03-simulation-engine]] | Spec for the tick engine and stress rules |
| [[05-engines]] | Engine-style module boundaries, extension points, dependency budget |
| [[04-roadmap]] | Milestones M0–M11, dependency order, parked ideas |
| [[process/sdlc\|SDLC process]] | How I work through tasks with Claude Code |
| [[process/claude-workflow\|Claude workflow]] | `/build`: lead agent plans + implements a milestone via helper agents (Opus 5.5) |
| `tasks/` | One note per milestone, checkboxes per task |
| `plans/` | Per-task implementation plans, the planner → implementer handoff |

## Status board

- [x] [[tasks/M0-project-setup\|M0 — Project setup]] ✅ 2026-07-12
- [x] [[tasks/M1-canvas-and-palette\|M1 — Canvas & component palette]] ✅ 2026-07-13
- [x] [[tasks/M2-simulation-engine\|M2 — Simulation engine]] ✅ 2026-07-14
- [x] [[tasks/M3-stress-scenarios\|M3 — Stress scenarios & realtime viz]] ✅ 2026-07-15
- [x] [[tasks/M4-interview-flow\|M4 — Interview flow & human grading]] ✅ 2026-07-15
- [x] [[tasks/M5-persistence-and-deploy\|M5 — Export/import & deploy]] ✅ 2026-07-19
- [x] [[tasks/M6-post-mvp-features\|M6 — Post-MVP features]] ✅ 2026-07-19 (T-6.1 auto-balancing LB)
- [x] [[tasks/M7-quick-mode\|M7 — Quick mode]] ✅ 2026-11-05
- [ ] [[tasks/M8-trustworthy-simulation\|M8 — Trustworthy simulation]] ← next
- [ ] [[tasks/M9-components-and-cost\|M9 — More components + cost]]
- [ ] [[tasks/M10-practice-depth\|M10 — Practice depth]]
- [ ] [[tasks/M11-live-interview-mode\|M11 — Live Interview mode]]
- [ ] [[tasks/MH-housekeeping\|MH — Housekeeping]] (slot in anywhere)

Ordered backlog: [[tasks/backlog]]. Parked: AI feedback.

## Conventions

- App code lives in `app/` inside this folder (kept out of Obsidian graph via excluded folder if noisy).
- Every task in `tasks/` is sized to be one Claude Code session and one commit.
- Definition of done lives in [[process/sdlc]].
