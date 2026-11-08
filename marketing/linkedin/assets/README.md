---
tags: [marketing, linkedin, assets]
created: 2026-11-08
---

# Assets

All UI footage was recorded on the live site (https://breakmydesign.com/) on 2026-11-08 with the built-in **3× traffic spike** scenario, so anyone can reproduce it. Charts and puzzle cards are rendered from verified `npm run sim` output.

| File | Post | What it shows |
|---|---|---|
| `hero.png` | Profile Featured | Landing page |
| `w1-launch.mp4` / `.gif` | [[W1-launch]] | Quick starter: 3× spike → Failed → add a replica → Passed (19.5s) |
| `w2-puzzle.png` | [[W2-puzzle]] | Puzzle card (1200×1200) with a real canvas screenshot |
| `w2-answer.png` | [[W2-puzzle]] answer | p95 chart: 3 and 6 read replicas vs 4 shards |
| `w3-side-by-side.mp4` | [[W3-simulator-was-lying]] | No queue (fails) vs with a queue (passes) |
| `w3-queue.*`, `w3-no-queue.*` | W3 | Single clips |
| `w4-failed.png` | [[W4-joke]] | Starter design, red "Failed" banner |
| `w5-side-by-side.mp4` | [[W5-retry-storm]] | Retries only (never recovers) vs retries + breaker (recovers) |
| `w5-retry-*.mp4/.gif` | W5 | Single clips |
| `sims/` | all | Design + scenario JSON, and the `out-*.txt` CLI runs behind every number in the posts |

**Upload video (MP4) rather than GIF.** LinkedIn autoplays muted video in the feed. Use the GIFs for comments or anywhere video isn't accepted.

## Reproduce a number

```bash
cd app
npm run sim -- ../marketing/linkedin/assets/sims/puzzle-ticket-sale.json ../marketing/linkedin/assets/sims/ticket-sale.json
```

`out-queue-before-fix.txt` came from the engine at `ee36a5b~1` (before M8-T1), run with a legacy-format copy of `queue-burst.json` (`callsPerRequest` → `trafficShare`).

## Re-record footage

1. Seed a design into the live site's localStorage as a Quick design: key `bp:design:<id>`, value `{ id, name, mode: "quick", scenarioId: "", graph, updatedAt }`, where `graph` is one of the `sims/*.json` files.
2. Open `https://breakmydesign.com/design/<id>` at 1280×800, pick **More scenarios → 3× traffic spike**, press **Run**, screenshot every ~0.3s for 32s into `.playwright-mcp/frames/<name>/f%03d.png`.
3. Run `bash marketing/linkedin/assets/make-media.sh` to crop to the canvas (767×800 at x=225) and render MP4 + GIF at about 4× speed.
