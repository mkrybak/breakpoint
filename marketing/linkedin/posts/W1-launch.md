---
tags: [marketing, linkedin, post]
status: draft   # ready once the "why" is filled
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
> Why I built it: [1–2 sentences, your real reason].
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

- [ ] "Why I built it": real, 1–2 sentences. If there's no story, cut the line; the post works without it
- [ ] Watch the video on a phone once

## First comment

> Try it here, no sign-up: https://breakmydesign.com/
> Start with "Quick simulation", then pick "3× traffic spike" under More scenarios.

## Results

See [[tracker]]. Notes:
