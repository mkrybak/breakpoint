---
tags: [marketing, linkedin, post]
status: ready
week: W1
publish: 2026-11-17
target: "20–40 reactions"
---

# W1 — Launch

**Goal:** context for the whole series. Tells people what BreakMyDesign is and why I care.
**Formula pattern:** first-person + "names the feeling" (coding interviews have a Run button, system design doesn't) + one visual.

## Draft

> I've been quietly building something since July.
>
> It's called BreakMyDesign.
>
> You draw a system design, like in an interview. Press Run, and it sends traffic through it. Green holds. Red breaks.
>
> In the clip: one app server, then 3x traffic for ten seconds. It falls over. I add a second server, run it again, and it holds.
>
> Why I built it: every design has a breaking point. I wanted people to find theirs before the interview does.
>
> In a coding interview you can run your code. In system design you draw boxes and hope. I wanted a Run button for diagrams.
>
> It's a side project and still rough. Over the next few weeks I'll share what it taught me, including the times my own simulator was wrong.
>
> Link in the comments if you want to break something.

## Visual

- **`../assets/w1-launch.mp4`** (19.5s, upload as video; LinkedIn autoplays muted video in the feed)
- Fallback: `../assets/w1-launch.gif`
- What it shows (recorded on breakmydesign.com, the real Quick mode starter): 3× traffic spike → **Failed** (p95 over 200 ms, errors over 1%) → select App server → replicas 1 → 2 → Re-run → **Passed**.

## Fill before posting

- [x] "Why I built it": filled from the product's own tagline ("Every design has a breaking point. Find yours before the interview does."), so it claims nothing I haven't said
- [ ] Watch the video on a phone once

### Other "why" options (only if true for me; each makes a personal claim)

- **Payments angle:** "Why I built it: I work on payment systems, where 'it should hold' is never good enough. I wanted that same honesty for interview answers."
- **Both sides of the table:** "Why I built it: I've been in system design rounds where nobody could say if the design would actually work. Not the candidate. Not the interviewer." (only if I've actually been in rounds like that)

## First comment

> Try it here, no sign-up: https://breakmydesign.com/
> Start with "Quick simulation", then pick "3× traffic spike" under More scenarios.

## Results

See [[tracker]]. Notes:
