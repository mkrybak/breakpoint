---
tags: [marketing, linkedin, post]
status: draft   # ready once the payments line is decided
week: W5
publish: 2026-12-15
target: "20–50 reactions"
---

# W5 — Retry storm

**Goal:** show seniority (recruiters read this) through a lesson from payments and distributed systems.
**Formula pattern:** counter-intuitive hook + real moment (optional) + one insight + side-by-side proof.

## Draft

> Retries feel responsible. Sometimes they're what takes you down.
>
> [Optional, only if true: one line about a real retry incident from payments work.]
>
> In the simulator: an app fleet calls one dependency. Timeout 200 ms, 3 retries. A normal setup.
>
> Traffic triples for ten seconds. The dependency slows down. Calls time out and get retried, so now it's getting 2.7x the calls.
>
> Then the spike ends. Traffic is back to normal.
>
> The system doesn't recover. 30% errors until the end of the run.
>
> Same design plus a circuit breaker: when calls keep failing, it stops calling for two seconds, fails fast, then lets a few test calls through.
>
> It still failed the test. The spike was real. But it came back: 0% errors while the other one was still burning.
>
> A breaker doesn't add capacity. It gives the thing you're hammering a chance to get back up.

## Visual

- **`../assets/w5-side-by-side.mp4`** (12.4s): left "Retries only", right "Retries + circuit breaker", same 3× spike, recorded on breakmydesign.com
- Single clips: `w5-retry-no-breaker.mp4/.gif`, `w5-retry-breaker.mp4/.gif`

## Fill before posting

- [ ] Payments line: a real incident in one sentence, or delete it
- [ ] Don't name the employer or anything confidential

## First comment

> The retry-storm setup is easy to rebuild: https://breakmydesign.com/ → two App servers, select the edge between them, set a timeout and retries, then run "3× traffic spike".

## Evidence (verified 2026-11-08)

| Design | Scenario | End state | Verdict | File / source |
|---|---|---|---|---|
| Retries only (`app/examples/retry-storm.json`) | 3× spike (UI) | 30.3% errors, p95 702 ms; edge shows ↻2.7× | Failed | UI recording |
| Retries + breaker (`assets/sims/retry-storm-breaker.json`) | 3× spike (UI) | 0.0% errors, p95 54 ms; recovered at 22.8s | Failed (errors during spike) | UI recording |
| Retries only | `dependency-blip` (2× for 1s, CLI) | 65% errors for 14s after a 1-second spike | FAIL | `out-retry-no-breaker.txt` |
| Retries + breaker | `dependency-blip` (CLI) | back to 0% from t=9s | FAIL | `out-retry-breaker.txt` |

Bonus fact for comments: in the CLI run, a **one-second** 2× blip left the no-breaker design at 65% errors for the remaining 14 seconds.

## Results

See [[tracker]]. Notes:
