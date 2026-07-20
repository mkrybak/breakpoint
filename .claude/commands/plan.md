---
description: Write an implementation plan for a milestone task (run in the Fable session)
argument-hint: T-x.y
---

# /plan — implementation plan for task $ARGUMENTS

You are the planning model. The plan will be executed by a weaker model (Sonnet) in a separate session, so every design decision must be made HERE. The implementer should never have to choose — only to type.

## Steps

1. **Locate the task.** Find `$ARGUMENTS` in `tasks/M*.md` (e.g. T-2.3 → `tasks/M2-simulation-engine.md`). Read the whole milestone note, especially the task's **Accept:** criteria.
2. **Read the relevant specs**: `01-architecture.md` always; `02-data-model.md`, `03-simulation-engine.md`, `05-engines.md` as the task requires; `process/sdlc.md` for definition of done.
3. **Read the current code** in `app/` that the task touches. The plan must be written against reality, not against the spec's aspiration — if they disagree, resolve it now and note the deviation.
4. **Write the plan** to `plans/$ARGUMENTS.md`:
   - `## Goal` — one paragraph: what exists when done. Copy the task's acceptance criteria verbatim.
   - `## Context` — files the implementer must read first; the engine rules that apply (public API via `index.ts` only, no sideways imports between engines except per the table in `05-engines.md`, no `react`/`next`/`zustand`/`drizzle`/`@xyflow` imports inside `src/lib/**`, plain-data contracts).
   - `## Steps` — numbered. Each step: exact file path, exact exported signatures/types, code-level detail (small snippets where wording would be ambiguous). No step may require a design decision.
   - `## Verification` — exact commands (`npm run lint && npm run typecheck && npm test` plus task-specific checks) and what output counts as pass.
   - `## Commit` — the exact commit message, `Mx-Ty: <description>` format.
5. **Do NOT write application code.** The plan file is the only deliverable.
6. Finish by telling the user: plan ready at `plans/$ARGUMENTS.md` — review it, then run `/implement $ARGUMENTS` (Sonnet executes it).
