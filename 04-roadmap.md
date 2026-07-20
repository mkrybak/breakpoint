---
tags: [roadmap]
status: done
---

# 04 — Roadmap

Six milestones, strictly ordered. Each milestone ends with a working demo — never a half-built layer. M0–M3 is the MVP that proves the idea (canvas + live stress test); M4–M5 make it a product.

```mermaid
flowchart LR
  M0[M0 setup] --> M1[M1 canvas] --> M2[M2 engine] --> M3[M3 scenarios + realtime viz] --> M4[M4 interview flow + grading] --> M5[M5 export/import + deploy]
```

| # | Milestone | Demo at the end | Est. sessions |
|---|---|---|---|
| M0 | [[tasks/M0-project-setup\|Project setup]] | `npm run dev` shows empty shell; lint/test/typecheck green | 1–2 |
| M1 | [[tasks/M1-canvas-and-palette\|Canvas & palette]] | Drag components, connect, configure, save/load JSON locally | 3–4 |
| M2 | [[tasks/M2-simulation-engine\|Simulation engine]] | CLI/test run: graph + scenario in → frames + verdict out, all golden tests pass | 4–5 |
| M3 | [[tasks/M3-stress-scenarios\|Stress scenarios & realtime viz]] | Press Run: nodes color live, edges animate, log streams, verdict shows; chaos buttons work | 3–4 |
| M4 | [[tasks/M4-interview-flow\|Interview flow & human grading]] | Full interview: phases with timers, notes, action recording, run sim; grader reviews timeline + replay and fills scorecard | 3–4 |
| M5 | [[tasks/M5-persistence-and-deploy\|Export/import & deploy]] | Live URL: do interview, export run bundle, import it on the review screen, past designs survive reload (no accounts — local-first) | 2–3 |

**Cut lines if time is short:** M4 timers (keep phases as plain sections). Never cut M2 tests — the engine is the product. (M5 auth/DB cut 2026-07-12 — local-first for now; a DB may return post-MVP if hosting/accounts become a goal, see [[02-data-model]] "If a database returns".)

Post-MVP backlog (not planned): interviewer spectator mode (live shared session — the realtime version of "watching"; MVP watches via recorded timeline), custom scenario editor UI, cost estimation overlay, more components (websocket gateway, geo-replication), leaderboards. **Far future, premium:** AI grading via Claude API — reuse the same rubric and scorecard schema, add a system grader.
