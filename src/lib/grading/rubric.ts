import type { Phase } from "@/lib/core";

/** A grader's score on the 1–5 rubric scale. */
export type RubricScore = 1 | 2 | 3 | 4 | 5;

/** Overall hiring recommendation. */
export type Recommendation = "strong-hire" | "hire" | "no-hire";

/** One 1–5 anchor: what a given score looks like for a phase. */
export interface RubricLevel {
  score: RubricScore;
  anchor: string;
}

/** The rubric for one interview phase: what to assess + the five anchors. */
export interface PhaseRubric {
  phase: Phase;
  title: string;
  focus: string;
  /** Exactly five levels, one per score, ordered 5 → 1 (best first). */
  levels: RubricLevel[];
}

/** A grader's score + written feedback for one phase. */
export interface PhaseScore {
  score: RubricScore;
  feedbackMd: string;
}

/**
 * The filled scorecard (02-data-model). Persisted to localStorage and, from M5,
 * carried inside the exported RunBundle.
 */
export interface Scorecard {
  /** ISO timestamp stamped when the run is exported (M5); "" until then. */
  runExportedAt: string;
  rubricScores: Record<Phase, PhaseScore>;
  overall: Recommendation;
}

/** Per-phase 1–5 anchors. Levels are ordered 5 → 1 so the top line is the bar. */
export const RUBRIC: PhaseRubric[] = [
  {
    phase: "requirements",
    title: "Requirements",
    focus: "Functional scope + quantified NFRs",
    levels: [
      {
        score: 5,
        anchor:
          "Top-3 functional requirements prioritized; NFRs quantified (RPS, p95, availability); scope explicitly bounded.",
      },
      {
        score: 4,
        anchor:
          "Clear functional and non-functional requirements; most NFRs quantified; minor scoping gaps.",
      },
      {
        score: 3,
        anchor:
          "Reasonable requirements, but NFRs vague or unquantified; little prioritization.",
      },
      {
        score: 2,
        anchor:
          "Requirements listed without prioritization or numbers; scope unclear.",
      },
      {
        score: 1,
        anchor:
          "Missing or off-target requirements; jumps to design without framing the problem.",
      },
    ],
  },
  {
    phase: "entities",
    title: "Entities",
    focus: "Core data model",
    levels: [
      {
        score: 5,
        anchor:
          "Core entities and key fields identified; relationships and access patterns anticipated.",
      },
      {
        score: 4,
        anchor: "Correct entities with most fields; relationships mostly clear.",
      },
      { score: 3, anchor: "Main entities present but fields or relationships thin." },
      { score: 2, anchor: "Incomplete or confused entity model." },
      { score: 1, anchor: "No coherent data model." },
    ],
  },
  {
    phase: "api",
    title: "API",
    focus: "Endpoint contract",
    levels: [
      {
        score: 5,
        anchor:
          "Endpoints cover every functional requirement; correct request/response shapes; pagination and idempotency where they matter.",
      },
      {
        score: 4,
        anchor: "Solid API covering the core flows; shapes mostly specified.",
      },
      { score: 3, anchor: "Basic endpoints, but gaps or inconsistent shapes." },
      { score: 2, anchor: "Sketchy API missing core operations." },
      { score: 1, anchor: "No usable API design." },
    ],
  },
  {
    phase: "hld",
    title: "High-level design",
    focus: "End-to-end architecture",
    levels: [
      {
        score: 5,
        anchor:
          "Coherent end-to-end design meeting the NFRs; component choices justified; data flow and storage sound.",
      },
      {
        score: 4,
        anchor:
          "Working design covering the requirements; reasonable component choices; minor gaps.",
      },
      { score: 3, anchor: "Plausible design, but bottlenecks or unjustified choices." },
      { score: 2, anchor: "Incomplete design; key components missing or misused." },
      { score: 1, anchor: "Design does not satisfy the requirements." },
    ],
  },
  {
    phase: "deepdive",
    title: "Deep dives + stress test",
    focus: "Scaling, bottlenecks, failure handling",
    levels: [
      {
        score: 5,
        anchor:
          "Finds bottlenecks and fixes them (caching, sharding, replication); survives the stress scenario; articulates trade-offs.",
      },
      {
        score: 4,
        anchor:
          "Handles the main scaling concern; responds to stress with sound mitigations.",
      },
      { score: 3, anchor: "Some scaling awareness but reactive; partial stress handling." },
      { score: 2, anchor: "Little scaling reasoning; design breaks under load." },
      { score: 1, anchor: "No deep-dive reasoning; ignores failures." },
    ],
  },
];

/** Overall recommendation options with display labels, in strong → weak order. */
export const RECOMMENDATION_OPTIONS: { value: Recommendation; label: string }[] = [
  { value: "strong-hire", label: "Strong hire" },
  { value: "hire", label: "Hire" },
  { value: "no-hire", label: "No hire" },
];

/** The rubric for one phase (falls back to the first phase if unknown). */
export function phaseRubric(phase: Phase): PhaseRubric {
  return RUBRIC.find((r) => r.phase === phase) ?? RUBRIC[0];
}

/** A blank scorecard: neutral score 3 per phase, "hire" overall, no timestamp yet. */
export function emptyScorecard(): Scorecard {
  return {
    runExportedAt: "",
    rubricScores: {
      requirements: { score: 3, feedbackMd: "" },
      entities: { score: 3, feedbackMd: "" },
      api: { score: 3, feedbackMd: "" },
      hld: { score: 3, feedbackMd: "" },
      deepdive: { score: 3, feedbackMd: "" },
    },
    overall: "hire",
  };
}
