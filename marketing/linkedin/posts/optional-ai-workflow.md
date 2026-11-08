---
tags: [marketing, linkedin, post]
status: idea   # only post if the [bracket] moment is real and specific
week: optional
publish: ""
target: "beat the 5–8 that generic AI posts get in my network"
---

# Optional — Building it with AI agents

**Why optional:** generic "AI made code cheap, judgment didn't" takes get 5–8 reactions in my network ([[02-audience]]). This only works around **one concrete moment**.

**Strongest real moment I have:** the queue bug from [[W3-simulator-was-lying]]. The code looked right and passed tests, but it punished correct designs. Only someone who's run queues in production would notice. Post this after W3, so readers already know the story.

## Draft

> 82 commits. 9 working days. About 25,000 lines of TypeScript and 52 test files.
>
> I wrote [very little / almost none: check honestly] of it by hand.
>
> One AI agent plans each task, another builds it, and a lead agent reviews the diff and screenshots before committing. I get pulled in for product questions.
>
> Remember the queue bug from a few weeks ago? [Who or what caught it, and how: one real sentence.]
>
> That's the part that didn't get automated. Knowing what a queue is supposed to do under load.
>
> AI made code cheap. Knowing when it's wrong didn't get cheaper.

## Fill before posting

- [ ] Recount commits / lines / tests on the day (`git rev-list --count HEAD`)
- [ ] "Wrote by hand": the honest answer
- [ ] How the queue bug was actually caught

## Evidence

- Counts as of 2026-11-08: 82 commits, 9 distinct commit days, 25,590 lines of .ts/.tsx under `app/`, 52 test/spec files
- Workflow: `process/claude-workflow.md` (`/build` lead + planner/implementer agents)
- Bug + fix: `tasks/M8-trustworthy-simulation.md` T-8.1, commit `ee36a5b`
