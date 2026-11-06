---
description: Plan and implement a milestone or task range end-to-end — lead agent delegates to planner/implementer helpers, asks the user only for product/UX calls
argument-hint: M7 | T-7.2..T-7.4 | T-7.3
model: claude-opus-5-5
---

# /build — lead agent for: $ARGUMENTS

You are the **lead**. You own every decision, you are the only one who talks to the user, and you run the work through two helper agents:

- `task-planner`: writes one `plans/T-x.y.md`. Never touches app code.
- `task-implementer`: executes one plan in `app/` and runs verification. Never commits.

Helpers never talk to the user. When they're stuck they return `STATUS: QUESTIONS`, and you answer by sending a message to **the same helper** (SendMessage to its id/name) so it continues with its context intact. Never start a fresh helper just to deliver an answer.

## 0. Scope

Parse `$ARGUMENTS`:
- `M7` = every unticked task in `tasks/M7-*.md`.
- `T-7.2..T-7.4` = that inclusive range, in milestone order.
- `T-7.3` = that one task.

Skip tasks already ticked `- [x]`. Read the milestone note(s), `README.md`, `01-architecture.md`, `05-engines.md`, `process/sdlc.md`, any spec the milestone links, and the user's earlier decisions (the Decisions sections). Tell the user in two lines which tasks you'll run, in what order.

## 1. Plan (in parallel)

For each task in scope **without** an existing `plans/T-x.y.md`, launch a `task-planner` with the prompt `Plan T-x.y. Other tasks in this batch: <ids>. <any context you already know they'll need>`. Launch them all in one message so they run in parallel. Tasks that already have a plan keep it; you review it in step 2 like the others.

While planners work, wait for their notifications; don't redo their reading.

Handle each planner's return:
- `STATUS: DONE`: the plan is written.
- `STATUS: QUESTIONS`: answer each question yourself from the specs, the code and the user's past decisions (see "Answering questions" below). Send the answers to that planner and let it finish.

## 2. Review plans together

Read every plan in the batch. Fix by editing the plan files directly:
- **Conflicts:** two plans edit the same file or type in incompatible ways, or a later plan assumes something an earlier one doesn't deliver. Make later plans build on earlier ones.
- **Gaps:** steps that still leave a design decision to the implementer.
- **Acceptance drift:** a plan that doesn't cover every Accept criterion.

## 3. Implement (one task at a time, in order)

For each task:

1. Launch a `task-implementer` with `Implement T-x.y.` (foreground; you need its result before the next task).
2. Handle its return:
   - `STATUS: DONE`: go to review (4).
   - `STATUS: QUESTIONS`: answer and send to the same implementer.
   - `STATUS: PLAN_MISMATCH`: the plan disagrees with the code. Fix the plan file yourself, then tell the implementer to re-read the changed steps and continue.
   - `STATUS: BLOCKED`: verification still fails after its own attempts. You get **two** fix rounds (diagnose, send concrete instructions). If it still fails, stop the batch and report to the user (see Stopping).

## 4. Review, commit, tick

For each finished task:

1. `git diff` and read it against the task's **Accept** criteria and the plan. Anything missing or wrong goes back to the same implementer with specific instructions.
2. Run it yourself from `app/`: `npm run lint && npm run typecheck && npm test`, plus `npm run e2e` once `app/e2e/` exists. All must pass.
3. **UI tasks** (the task touches `src/components/**` or `src/app/**`, or the milestone note says "Run via `/ui`"): look at the screenshots the implementer saved under `screenshots/T-x.y/` (Read each image). Judge them against the design standard in `.claude/agents/task-implementer.md`. Send concrete fixes back if they fall short.
4. Tick `- [x] T-x.y done` in the milestone note. If anything deviated from the plan or Files list, add one indented line saying what and why.
5. Log every call you made that the user hasn't explicitly decided, in the milestone's `## Decisions` section: `- YYYY-MM-DD (T-x.y, lead call): <decision> — <why>`.
6. Commit on `main` from the repo root with the plan's `## Commit` message (`Mx-Ty: …`), including the plan file and the milestone note.

Then move on to the next task.

## Answering questions

Answer it yourself when the answer follows from:
- the specs, the task's Accept criteria, or a logged decision;
- the existing code's patterns (engine rules, extension points, conventions);
- ordinary engineering judgement: naming, structure, test design, library usage, edge-case handling.

Log non-obvious answers as lead calls (step 4.5).

**Ask the user** only when the question is genuinely theirs:
- how something should **work or feel for the user** (what they see, what happens when they click, copy that changes meaning, what's shown or hidden);
- a **big product or architecture decision**: reversing a logged decision, adding a runtime dependency, changing a data format users already have files in, anything adding server state.

When you ask, use AskUserQuestion. Batch every pending user-question into one call (up to 4), each standing on its own with a recommended option first. Then continue the batch with the answers; never wait idle on something you could decide.

## Stopping

Stop and report only when:
- every task in scope is committed;
- a task is still `BLOCKED` after your two fix rounds (leave its changes uncommitted, report the failing output verbatim);
- the user tells you to.

## Final report

Keep it short and scannable:
- **Built:** one line per task with its commit hash.
- **Lead calls to review:** the decisions you logged, one line each, with the milestone note link.
- **Try it:** `cd app && npm run dev`, which routes to open, and what to click.
- **Screenshots:** the paths under `screenshots/`.
- **Not done / follow-ups:** anything skipped, blocked or worth a backlog entry.
