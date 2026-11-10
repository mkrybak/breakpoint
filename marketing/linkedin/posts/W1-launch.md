---
tags: [marketing, linkedin, post]
status: ready
week: W1
publish: 2026-11-10
target: "15–30 reactions (no friend DMs in the warm-up)"
---

# W1 — Launch

**Goal:** context for the whole series. Tells people what BreakMyDesign is and why I care.
**Formula pattern:** first-person + "names the feeling" (coding interviews have a Run button, system design doesn't) + one visual.

## Draft

> In a coding interview you can run your code.
> In system design you draw boxes and hope.
>
> So I built a Run button for diagrams. It's called BreakMyDesign.
>
> You draw a system design, like in an interview. Press Run, and it sends traffic through it. Green holds. Red breaks.
>
> In the clip: one app server, then 3x traffic for ten seconds. It falls over. I add a second server, run it again, and it holds.
>
> I didn't have time for a big side project. So it got built in 9 days: a few in July, a few this month. AI agents wrote most of the code. I decided what it should do and what "correct" means.
>
> Every design has a breaking point. I wanted people to find theirs before the interview does.
>
> It's still rough. Over the next few weeks I'll share what it taught me, including the times my own simulator was wrong.
>
> Link in the comments if you want to break something.

**Above "…more":** "In a coding interview you can run your code. / In system design you draw boxes and hope. / So I built a Run button for diagrams…": the hook works on its own.

**Facts behind the new lines:** 9 distinct commit days (Jul 12, 13, 14, 15, 19 and Nov 5, 6, 7, 8; `git log --format=%ad --date=short -- . ':!marketing' | sort -u`, marketing-only commits excluded since they aren't building). Code written by Claude Code agents through `/build` (`process/claude-workflow.md`); I'm the one asked for product calls. Recount the days if more work lands before posting.

## Visual

- **`../assets/w1-launch.mp4`** (19.5s, upload as video; LinkedIn autoplays muted video in the feed)
- Fallback: `../assets/w1-launch.gif`
- What it shows (recorded on breakmydesign.com, the real Quick mode starter): 3× traffic spike → **Failed** (p95 over 200 ms, errors over 1%) → select App server → replicas 1 → 2 → Re-run → **Passed**.

## Fill before posting

- [x] "Why I built it": filled from the product's own tagline ("Every design has a breaking point. Find yours before the interview does."), so it claims nothing I haven't said
- [x] Opening rewritten 2026-11-08: "quietly building since July" overstated it (9 working days, AI wrote most of the code), and it was weak above "…more"
- [x] Recount commit days: still 9 (checked Mon Nov 9, 22:20 PT)
- [ ] Watch the video on a phone once

### Other "why" options (only if true for me; each makes a personal claim)

- **Payments angle:** "Why I built it: I work on payment systems, where 'it should hold' is never good enough. I wanted that same honesty for interview answers."
- **Both sides of the table:** "Why I built it: I've been in system design rounds where nobody could say if the design would actually work. Not the candidate. Not the interviewer." (only if I've actually been in rounds like that)

## First comment

> Try it here, no sign-up: https://breakmydesign.com/
> Start with "Quick simulation", then pick "3× traffic spike" under More scenarios.

## Results

See [[tracker]]. Notes:
