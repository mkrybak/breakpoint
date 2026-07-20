# Breakpoint

System design interview platform: draw an architecture on a canvas, run a live
stress-test simulation against it, and grade the session against a rubric. Fully
client-side and **stateless** — no accounts, no database, no server state.
Designs autosave to `localStorage`; runs and graded reviews move between people
as JSON files.

> **The specs live one level up, outside this repo** (`../01-architecture.md`,
> `../02-data-model.md`, …) and are the source of truth. This directory (`app/`)
> is the git repository root and the only thing that deploys.

## Prerequisites

- **Node.js 22+** — production runs on Node 22 (Vercel's default runtime); local
  dev on Node 20/22/24 all work.
- npm (bundled with Node). Exact dependency versions are pinned in
  `package-lock.json`.

## Getting started

```bash
npm ci        # install exact locked versions (npm install also works)
npm run dev   # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint + dependency-cruiser engine-boundary check |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest suite, including the deterministic golden simulation tests |
| `npm run sim` | Headless CLI: graph + scenario → verdict (see `examples/`) |
| `npm run depgraph` | Regenerate `../module-graph.mmd` |
| `npm run format` | Prettier write |

## Verifying a change

```bash
npm run lint && npm run typecheck && npm test
npm run build   # deploy gate
```

## Environment variables

**None.** The app is entirely client-side and stateless — no database, no auth,
no API keys, no secrets. Persistence is `localStorage` plus JSON file
export/import (design bundles and graded reviews). There is nothing to configure
and nothing to operate.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request. On Node 22 — the
same runtime as production — it runs `npm ci`, then `lint`, `typecheck`, `test`
(including the golden simulation tests), and `build`. A green run means the
commit is deployable.

## Deploy (Vercel)

A zero-config Next.js app — no `vercel.json`. The git repository root is the
vault (one level up); this Next.js app lives in `app/`, so Vercel's Root
Directory is **`app`**.

First-time setup (one-time, from the Vercel dashboard):

1. Push this repo's `main` branch to a GitHub repository.
2. On <https://vercel.com/new>, **Import** that GitHub repository.
3. Vercel auto-detects the **Next.js** preset — leave Build Command
   (`next build`), Output, and Install Command at their defaults.
4. **Root Directory:** `app` (this folder — the repo root is one level up).
5. **Environment Variables:** none.
6. Click **Deploy**.

After setup, every push to `main` deploys to production and every pull request
gets a preview URL — no further action. Since there is no server state, there is
nothing to back up, migrate, or operate.

**Live URL:** _add the production URL here after the first deploy._
