---
tags: [marketing, linkedin, post]
status: ready
week: W2
publish: 2026-11-26
target: "10+ comments"
---

# W2 — Puzzle: what breaks first?

**Goal:** comments. A third of my audience is entry-level and loves a puzzle; comments push reach more than reactions do.
**Formula pattern:** tension hook + one specific scenario + the answer held back until the next day.

## Draft

> Quick system design puzzle.
>
> Concert tickets go on sale at 10:00. Traffic jumps from 10k to 40k requests per second. 40% of those requests are people buying.
>
> The design: load balancer, 14 app servers, Redis serving 90% of reads, Postgres with 3 read replicas.
>
> On paper it looks fine.
>
> In the simulator it falls over within seconds.
>
> What breaks first?
>
> I'll post the answer and the replay in the comments tomorrow.

## Visual

- **`../assets/w2-puzzle.png`** (1200×1200; the canvas is a real screenshot from breakmydesign.com)

## Fill before posting

- [ ] Nothing. Ready as is

## First comment (when posting)

> No hints yet. Guess first 🙂 The tool is here if you want to try: https://breakmydesign.com/

## Answer comment (next day, same time) + `../assets/w2-answer.png`

> Answer: the database, but not for the reason most people guess.
>
> 40k requests × 40% purchases = 16k writes per second. One Postgres primary handles about 15k.
>
> Redis only helps reads. Read replicas only help reads. Every write still lands on one machine.
>
> I tried 6 read replicas instead of 3. Exactly the same line.
>
> Splitting writes across 4 shards: p95 93 ms, zero errors.
>
> (Sharding has its own bill: cross-shard queries, rebalancing, hot keys. But that's the bottleneck here.)

Reply to every guess. Thank the people who said "writes" or "the primary" by name.

## Evidence (verified 2026-11-08 with `npm run sim`)

| Design | p95 at the end | Errors | Verdict | File |
|---|---|---|---|---|
| Postgres + 3 read replicas | 924 ms | 2.5% | FAIL | `assets/sims/out-puzzle-3-replicas.txt` |
| Postgres + 6 read replicas | 924 ms | 2.5% | FAIL | `assets/sims/out-puzzle-6-replicas.txt` |
| Sharded, 4 units | 93 ms | 0% | PASS | `assets/sims/out-puzzle-sharded.txt` |

Scenario: `assets/sims/ticket-sale.json` (10k RPS → 40k over 5s, 60% reads). Capacities from the app's component registry: SQL primary ~15k writes/s.

## Results

See [[tracker]]. Notes:
