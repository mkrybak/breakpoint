---
tags: [process, claude]
---

# Claude Code workflow — `/build` lead + helper agents

One command runs a milestone end-to-end on **Opus 5.5**. A lead agent (your session) owns every decision and delegates the reading-heavy work to helper agents, so its own context stays fresh across a whole milestone. You're pulled in only for calls that are genuinely yours.

## The command

```
/build M7               # every unticked task in the milestone
/build T-7.2..T-7.4     # a range
/build T-7.3            # one task
```

| Who | Defined in | Does | Talks to |
|---|---|---|---|
| **Lead** | `.claude/commands/build.md` | Scopes the batch, reviews plans together, reviews diffs and screenshots, answers helper questions, commits `Mx-Ty:` on main, ticks boxes, logs its calls | you and helpers |
| **task-planner** | `.claude/agents/task-planner.md` | Writes one `plans/T-x.y.md`; no app code | lead only |
| **task-implementer** | `.claude/agents/task-implementer.md` | Executes one plan, runs verification, screenshots UI; never commits | lead only |

## Flow

```
/build M7
  ├─ plan:       planners in parallel → lead answers their questions → lead reviews all plans together
  ├─ implement:  one task at a time → implementer → lead reviews diff + reruns checks (+ screenshots for UI)
  │              → commit Mx-Ty on main → tick → log lead calls in the milestone Decisions
  └─ report:     commits, lead calls to review, screenshots, routes to try
```

- **Helper questions** go to the lead, which answers by messaging the same helper (its context is kept). Plan/code mismatches are fixed in the plan by the lead, never improvised by the implementer.
- **The lead asks you** (batched, with a recommended option) only about how something should work or feel for the user, or a big product/architecture decision: reversing a logged decision, a new runtime dependency, a breaking file-format change, anything adding server state.
- **It stops** when the batch is done, when a task is still failing after two fix rounds by the lead, or when you say so.
- **UI tasks** are checked by screenshots (`screenshots/T-x.y/`, git-ignored) against the design standard in `task-implementer.md`. You see them in the final report and give feedback afterwards.
- **Lead calls** are logged as `- YYYY-MM-DD (T-x.y, lead call): …` in the milestone's `## Decisions`, so you can review every decision you didn't make yourself.

## Manual tools (still available)

| Command | When |
|---|---|
| `/plan T-x.y` | Write a single plan by hand and read it before anything runs; `/build T-x.y` then implements it (existing plans are reused) |
| `/ui T-x.y` | Hands-on UI iteration where you review in the browser as it goes |

## Decisions

- 2026-07-12: Two-session plan handoff (Fable plans, Sonnet implements) over subagent orchestration — cheaper, and the human reviews between plan and code.
- 2026-11-05: **Replaced** by `/build`: one model (Opus 5.5) for planning and implementation; a lead agent delegates to planner/implementer helpers that report only to it. The human is consulted only for user-facing or big product/architecture calls and reviews results at the end. `/implement` (Sonnet-forced) removed; `/plan` and `/ui` kept as manual tools. Why: the manual plan → review → implement loop per task was the bottleneck, and one strong model removes the plan-for-a-weaker-model overhead.
