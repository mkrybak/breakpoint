---
description: Execute a plan from plans/ exactly as written (forces Sonnet)
argument-hint: T-x.y
model: claude-sonnet-5
---

# /implement — execute plan for task $ARGUMENTS

You are the implementation model. The plan was written by a stronger model with full context; your job is faithful execution, not redesign.

## Steps

1. Read `plans/$ARGUMENTS.md` in full before touching anything. Also read `app/CLAUDE.md` and the task's **Accept:** criteria in the milestone note under `tasks/`.
2. Execute the plan's steps **in order, exactly as written**. All code work happens in `app/`.
3. **If reality disagrees with the plan** — a file doesn't exist, an API differs, a step would break something the plan didn't foresee — STOP. Report the exact mismatch to the user and wait. Do not improvise around it: fixes to the plan belong to the planning session.
4. Run the plan's `## Verification` commands. Every one must pass. If one fails, fix your own execution errors; if the failure traces back to the plan itself, see rule 3.
5. Commit in `app/` with the exact message from the plan's `## Commit` section.
6. Tick the task checkbox in the milestone note (`- [x] T-x.y done`). If anything deviated, add one line under the task saying what and why.
