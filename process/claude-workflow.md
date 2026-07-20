---
tags: [process, claude]
---

# Claude Code workflow — model split

Fable (strongest model) does the thinking, Sonnet (cheaper) does the typing, UI stays with Fable because taste doesn't delegate. The handoff artifact is a plan file in `plans/`.

## The three commands

| Command | Session model | What it does |
|---|---|---|
| `/plan T-x.y` | Fable | Reads specs + task + current code, writes `plans/T-x.y.md` — code-level detail, all decisions made. Writes no app code. |
| `/implement T-x.y` | any (frontmatter forces **Sonnet**) | Executes `plans/T-x.y.md` exactly. Stops and reports if the plan disagrees with reality. Verifies, commits `Mx-Ty:`, ticks the checkbox. |
| `/ui <task>` | Fable | Implements UI directly to the design standard in the command. User reviews at localhost and gives feedback; no self-declared beauty. |

## Loop per task

```
Fable session:  /plan T-2.3   → review plans/T-2.3.md yourself
Sonnet session: /implement T-2.3 → review the diff, done
UI tasks:       /ui T-1.2     → open localhost, comment, iterate
```

- `/implement` carries `model: claude-sonnet-5` frontmatter, so it uses Sonnet even if you run it inside the Fable session — a second session is optional, not required.
- If `/implement` reports a plan/reality mismatch, fix the plan in the Fable session (`/plan` again), don't patch live in the Sonnet session.
- Plan files are disposable once the task is committed — the vault specs stay the source of truth ([[process/sdlc|SDLC]] rules apply: spec notes get updated when reality wins).

## Decisions

- 2026-07-12: Two-session plan handoff over subagent orchestration — cheaper, and the human reviews between plan and code. UI verification is manual browser review, no Playwright loop.
