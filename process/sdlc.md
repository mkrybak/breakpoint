---
tags: [process]
---

# SDLC — simple, one task at a time

Lightweight process for a solo project implemented with Claude Code. No ceremony, just enough structure that any task can be picked up cold.

## Task lifecycle

```
backlog → next → in-progress → review → done
```

Status is tracked two ways:

1. **Checkbox** in the milestone note (`- [ ]` / `- [x]`) — the source of truth.
2. **Frontmatter** `status:` on the milestone note (`planning | active | done`) so the vault graph/search shows where I am.

Rules:

- Only **one task in-progress** at a time. Finish or park it before starting the next.
- Work milestones in order (M0 → M5). Inside a milestone, tasks are ordered by dependency.
- If a task turns out bigger than one session, split it: add `T-x.ya`, `T-x.yb` sub-checkboxes, never leave a half-done monolith.

## Working a task with Claude Code

Model split and commands: [[claude-workflow]].

1. Open the milestone note, pick the top unchecked task.
2. In a Fable session: `/plan T-2.3` → review the generated `plans/T-2.3.md`.
3. Run `/implement T-2.3` (forces Sonnet) to execute the plan. UI tasks instead: `/ui T-2.3` in the Fable session, review at localhost.
4. Review the diff yourself before committing — every task ends with a commit.
5. Commit message: `M2-T3: short description` (milestone-task prefix makes history greppable).
6. Tick the checkbox, add a one-line note under the task if anything deviated from plan.

## Definition of done (every task)

- [ ] Code compiles, `npm run lint` and `npm run typecheck` pass
- [ ] Acceptance criteria in the task are met
- [ ] Unit tests exist for pure logic (simulation engine especially — it must be deterministic and testable)
- [ ] No dead code / commented-out blocks left behind
- [ ] Committed with the `Mx-Ty:` prefix

## Definition of done (every milestone)

- [ ] The demo described in the milestone note works end-to-end
- [ ] README of `app/` updated if setup steps changed
- [ ] Milestone frontmatter set to `status: done`, checked off in [[README|README]]

## Branching

Solo project: work on `main`, commit per task. If a milestone is risky (M2 engine rewrite), branch `m2-engine`, squash-merge when the milestone demo passes.

## When plans change

Plans are written before code — they will be wrong somewhere. When reality disagrees with a spec note: update the note in the same session, add a line to the `## Decisions` log at the bottom of the affected note. The vault must stay truthful, or it's dead weight.
