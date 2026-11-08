---
tags: [marketing, linkedin, post]
status: ready
week: W3
publish: 2026-11-26
target: "30–80 reactions (best breakout candidate)"
---

# W3 — My simulator was lying to me

**Goal:** breakout. Engineers love an honest bug story, and this one teaches a real lesson.
**Formula pattern:** confession hook + struggle over announcement + one insight + proof.

## Draft

> My simulator was lying to me.
>
> BreakMyDesign stress-tests system designs. Draw the boxes, add traffic, see what breaks.
>
> I gave it a classic setup: app servers drop jobs into a queue, two workers process them. Then 3x traffic for a few seconds.
>
> It said: more than half the requests failing at the peak. Failed.
>
> Here's the embarrassing part. Those were exactly the numbers you get with no queue at all.
>
> My code treated a queue like every other box: a tiny buffer, then drop. So the queue did nothing.
>
> A real queue soaks up the spike. The workers fall behind for a while. Users never notice.
>
> After the fix: 0% errors, p95 around 30 ms. The backlog grows, the workers keep chewing.
>
> A tool that punishes the right answer is worse than no tool. Because people believe it.

## Visual

- **`../assets/w3-side-by-side.mp4`** (12.5s): left "No queue" fails, right "With a queue" passes. Same 3× spike, recorded on breakmydesign.com
- Single clips if preferred: `w3-queue.mp4/.gif`, `w3-no-queue.mp4/.gif`

## Fill before posting

- [ ] Nothing. Every number is verified (below)

## First comment

> Try the same thing: https://breakmydesign.com/ (Quick simulation → drag in a Queue and a Worker, then pick "3× traffic spike").

## Evidence (verified 2026-11-08)

Same design (`assets/sims/queue-burst.json`: 5 app servers → queue → 2 workers), same scenario (`assets/sims/burst-3x.json`: 1,500 RPS, ×3 for 3s):

| Engine | Errors at peak | p95 | Verdict | File |
|---|---|---|---|---|
| Before the fix (commit before `ee36a5b` M8-T1) | 33% → 56% | 15–18 ms | FAIL | `out-queue-before-fix.txt` |
| No queue at all (current engine) | 33% → 56% | 1.7 s | FAIL | `out-no-queue.txt` |
| After the fix (current engine) | 0% | 27–32 ms | PASS | `out-queue-after-fix.txt` |

In the UI recording (10s spike) the queue backlog reaches ~20k messages with 10s lag, 0% errors, Passed.

## Results

See [[tracker]]. Notes:
