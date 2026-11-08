---
tags: [milestone]
status: planning
milestone: M11
depends-on: M10
---

# M11 — Live Interview mode

**Goal:** A real interviewer and a candidate open the same session and see the design change live. The candidate builds; the interviewer runs the clock, sets requirements, fires chaos and grades, with interviewer-only content never reaching the candidate.

**Demo:** The interviewer creates a session and sends the candidate link. Both screens update as the candidate drags in a cache. The interviewer fires a surprise region outage mid-run, and both watch it play out. The interviewer fills the scorecard privately, ends the session, and exports the run bundle for review.

**Spec:** [[docs/superpowers/specs/2026-11-05-product-modes-design]] (Interview mode). This milestone is the first to need a server, and it reverses the 2026-07-12 "no server state" decision **for this mode only**.

## Tasks

### T-11.1 — Design spike: realtime sync
- [ ] T-11.1 done

**Files:** new spec in `docs/superpowers/specs/`, Decisions in [[01-architecture]] and [[05-engines]]
**Accept:** A written decision on:
- **Sync technology.** For example, a hosted realtime service, a CRDT library over a websocket server, or a Durable-Object style room. Note that Vercel serverless functions don't hold websockets.
- **Identity.** Likely "possessing the link = your role", no accounts.
- **Session lifetime and stored data.**
- **Cost.**
- **How interviewer-only data is kept off the candidate's client.** Filtering in the UI isn't enough.

The decision includes dependency-budget entries. Throwaway prototype allowed.

### T-11.2 — Sessions + role links
- [ ] T-11.2 done

**Files:** per T-11.1
**Accept:** The Interview card on the landing page creates a session and shows two links (interviewer, candidate). Opening a link joins with that role. Presence shows who's connected. The design record has `mode: "interview"`.

### T-11.3 — Live design sync
- [ ] T-11.3 done

**Files:** `src/stores/design-store.ts`, `src/stores/phase-store.ts`, sync adapter
**Accept:** Graph edits, the phase clock and shared phase notes sync both ways with no lost edits under normal latency. Reconnecting catches up. The action timeline records on one side only (no double events).

### T-11.4 — Interviewer-only panel
- [ ] T-11.4 done

**Files:** new interviewer panel, `src/components/review/Scorecard.tsx`
**Accept:** Only the interviewer sees and controls: private notes, the scorecard, NFR editing, scenario choice, chaos buttons, and surprise stress events (scheduled or fired live). The candidate's client never *receives* this data (verified in the network tab). Run via `/ui`.

### T-11.5 — Shared simulation runs
- [ ] T-11.5 done

**Files:** `src/stores/sim-store.ts`, sync adapter
**Accept:** Both sides watch the same run. The engine is deterministic, so the plan should prefer syncing *inputs* (graph, scenario, seed, chaos injections with their tick) over streaming frames; both browsers then compute identical frames locally. Verify the frames match byte for byte in a test.

### T-11.6 — End session → review
- [ ] T-11.6 done

**Files:** export path in `src/persistence/local.ts`, review screen
**Accept:** The interviewer ends the session. Either side can export the run bundle (the interviewer's includes the scorecard and private notes; the candidate's doesn't). The existing review screen opens it unchanged.

## Decisions

- 2026-11-05: Interview = live shared session (both parties in BreakMyDesign), not screen-share. Quick and Practice stay local-first.
