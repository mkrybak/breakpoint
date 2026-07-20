@AGENTS.md

# Breakpoint — app

System design interview platform: canvas (React Flow) + live stress-test simulation + human grading. This folder is the Next.js app; the **specs live in the vault one level up** and are the source of truth.

## Read the spec first

| Note | When |
|---|---|
| `../01-architecture.md` | Always — stack, repo layout, decisions log |
| `../02-data-model.md` | Types, persistence shapes |
| `../03-simulation-engine.md` | Anything in `src/lib/simulation` |
| `../05-engines.md` | Module boundaries — read before adding imports or deps |
| `../tasks/M*.md` | The task you're implementing, with acceptance criteria |
| `../process/claude-workflow.md` | The /plan → /implement → /ui workflow |

## Engine rules (enforced by dependency-cruiser, fails lint)

- `src/lib/*` are **engines**: pure TS, plain-data in/out. Banned imports inside `src/lib/**`: `react`, `next`, `zustand`, `@xyflow/*`.
- Public API via each engine's `index.ts` only — no deep imports from outside the engine (its own tests excepted).
- No sideways engine imports except per the table in `../05-engines.md` (`validation`/`simulation` may import `registry`; everyone may import `core`).
- Extension = add a data/map entry (registry map + plain data), never edit a switch in another module. Extension points table: `../05-engines.md`.
- Shell (components, stores, `src/app`, `src/persistence`) may import any engine.
- **No server state.** No database, no auth, no API routes — persistence is localStorage + JSON file export/import (decision 2026-07-12, see `../01-architecture.md`).

## Conventions

- Commits: `Mx-Ty: short description` (e.g. `M2-T3: seeded PRNG`), one commit per task.
- **Dependency budget**: target runtime deps are only `next`, `react`, `@xyflow/react`, `zustand`. Any other runtime dep needs a Decisions entry in `../01-architecture.md` answering: what does it save, what does it cost, could 30 lines of our own code do it?
- Verification for every task: `npm run lint && npm run typecheck && npm test` (build: `npm run build`).
- When reality disagrees with a spec note: update the note in the same session, add a line to its `## Decisions` log.
