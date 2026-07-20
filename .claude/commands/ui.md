---
description: Implement a UI task to the design quality bar (run in the Fable session; user reviews in browser)
argument-hint: task id or component description
---

# /ui — build UI for: $ARGUMENTS

UI tasks skip the plan→Sonnet handoff: you (the strongest model) design and implement directly. The user judges the result in their browser — you never declare it beautiful yourself.

## Steps

1. Read the relevant task/spec (`tasks/`, `01-architecture.md`) and the existing components in `app/src/components/` so new work matches what's there.
2. Implement to the design standard below. Run `npm run lint && npm run typecheck` when done.
3. Tell the user: which route to open (they run `npm run dev` themselves), what to look at, and what states to try (hover, empty, error, zoomed-out canvas).
4. Iterate on their feedback until they approve. Then commit with the `Mx-Ty:` prefix and tick the checkbox.

## Design standard

Breakpoint is a professional engineering tool — a canvas where system designs get stress-tested. The UI should feel like a precision instrument, not a marketing site.

- **Dark-first.** Canvas-centric apps live in dark mode; design there, verify light mode works.
- **Tokens, not one-offs.** Colors, radii, and spacing come from the Tailwind theme. No scattered hex values; one accent color, used sparingly for what matters (running sim, failing node, verdict).
- **Spacing scale.** 4px base grid, consistent gaps within a component class (all panels pad the same, all HUD cards gap the same).
- **Hierarchy.** At a glance: canvas dominates, panels support, HUD informs. Type sizes and weights make the important thing unmissable; secondary info recedes (muted foreground, smaller size).
- **Canvas nodes.** Custom React Flow nodes must stay legible zoomed out: strong silhouette, icon + short label, utilization/state readable via color **and** shape/icon (never color alone).
- **Motion.** Hover/focus states on every interactive element; transitions 150–200ms; sim-driven animation (edge flow, util bars) is the one place motion is generous. Nothing else animates gratuitously.
- **States are designed.** Empty canvas, loading, error, and disabled states get real treatment — never default browser styling or a bare "No data".
- **Accessibility floor.** Visible focus rings, 4.5:1 contrast for text, interactive targets ≥ 32px.
