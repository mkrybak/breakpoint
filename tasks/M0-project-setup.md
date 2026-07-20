---
tags: [milestone]
status: done
milestone: M0
depends-on: none
---

# M0 — Project setup

**Goal:** Empty but fully wired Next.js app — every later task starts from a green baseline.

**Demo:** `docker compose up` starts Postgres; `npm run dev` serves the shell; `npm run lint && npm run typecheck && npm test` all pass.

## Tasks

### T-0.1 — Scaffold Next.js app
- [x] T-0.1 done — Next.js **16.2.10** (current stable, spec said 15 — see [[01-architecture]] Decisions). Git initialized inside `app/` with local identity.

**Files:** `app/` (create-next-app), `app/README.md`
**Accept:** Next.js 15 + TypeScript + Tailwind + App Router; strict tsconfig; `src/` layout matching [[01-architecture]]; folders created with placeholder `index.ts` files.
**Claude Code prompt:** "Scaffold per ../01-architecture.md repo layout section. Use create-next-app with --typescript --tailwind --app --src-dir. Add the empty folder structure with barrel files."

### T-0.2 — Tooling: lint, test, hooks
- [x] T-0.2 done

**Files:** `eslint.config.js`, `vitest.config.ts`, `package.json` scripts
**Accept:** ESLint + Prettier configured; Vitest runs one dummy test; scripts: `dev, build, lint, typecheck, test`.

### T-0.3 — Docker Compose + Drizzle skeleton
- [x] T-0.3 done — verified live 2026-07-12 after Docker Desktop WSL integration enabled: `docker compose up -d` runs Postgres 17, `npm run db:migrate` applied, `users` table confirmed via psql.

**Files:** `docker-compose.yml`, `src/server/db.ts`, `src/server/schema.ts`, `drizzle.config.ts`
**Accept:** Compose runs Postgres 17 with volume; Drizzle connects; empty `users` table migration applies with `npm run db:migrate`.

### T-0.4 — Install React Flow + Zustand, CLAUDE.md
- [x] T-0.4 done — hello-world flow on `/design/[id]` (so `/design/test` works). CLAUDE.md keeps the create-next-app `@AGENTS.md` Next-16 warning.

**Files:** `package.json`, `app/CLAUDE.md`
**Accept:** `@xyflow/react` and `zustand` installed and rendering a hello-world flow on `/design/test`. `CLAUDE.md` written for Claude Code: points to the spec notes (`../01..05`), summarizes the engine rules from [[05-engines]] (public API via index.ts, no sideways/framework imports in `src/lib/**`, extension via registry maps), commit convention `Mx-Ty:`, dependency budget ("new runtime dep needs a Decisions entry").

### T-0.5 — Enforce module boundaries
- [x] T-0.5 done — violation proven to fail lint (framework + shell import test). `npm run depgraph` outputs **mermaid** (`module-graph.mmd`) instead of SVG: no graphviz on machine, mermaid renders natively in Obsidian.

**Files:** `.dependency-cruiser.cjs`, `package.json` scripts
**Accept:** dependency-cruiser encodes the engine table from [[05-engines]]: engines import only `core` (+ `registry` where allowed), never shell/framework; deep imports past `index.ts` forbidden; `npm run lint` fails on violation (prove it with a deliberate bad import, then remove it); `npm run depgraph` outputs module-graph SVG.

## Decisions

- 2026-07-12: Node 24.18 LTS installed to `~/.local/opt` (symlinks in `~/.local/bin`, shadows apt's EOL Node 18). No nvm — installer script was blocked, official tarball used instead.
- 2026-07-12: depgraph emits mermaid, not SVG — no graphviz dependency, Obsidian renders it natively.
- 2026-07-12: T-0.3 live check passed after user enabled Docker Desktop WSL integration. Milestone demo verified: compose up ✓, dev server served `/design/test` (HTTP 200, React Flow markup) ✓, lint/typecheck/test/build ✓.
- 2026-07-12 (later same day): T-0.3's DB layer **removed again** — project went local-first, no auth (may return post-MVP; see [[01-architecture]] Decisions). Code recoverable from `app/` git commit `5de2a01`; removal commit `5f02d71`.
