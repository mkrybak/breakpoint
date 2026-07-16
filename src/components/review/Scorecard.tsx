"use client";

import { useEffect } from "react";
import {
  RECOMMENDATION_OPTIONS,
  RUBRIC,
  type PhaseRubric,
  type RubricScore,
} from "@/lib/grading";
import { useScorecardStore } from "@/stores/scorecard-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const TEXTAREA =
  "mt-2 w-full resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-mono text-xs leading-relaxed text-neutral-100";

const SCORES: RubricScore[] = [1, 2, 3, 4, 5];

function pillClass(active: boolean, base: string): string {
  return [
    base,
    active
      ? "border border-sky-500/60 bg-sky-500/15 text-sky-200"
      : "border border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500",
  ].join(" ");
}

export function Scorecard({ id }: { id: string }) {
  const attach = useScorecardStore((s) => s.attach);
  const overall = useScorecardStore((s) => s.scorecard.overall);
  const setOverall = useScorecardStore((s) => s.setOverall);

  useEffect(() => {
    attach(id);
  }, [attach, id]);

  return (
    <section className="flex flex-col gap-6">
      <h2 className={HEADING}>Scorecard</h2>

      {RUBRIC.map((rubric) => (
        <PhaseBlock key={rubric.phase} rubric={rubric} />
      ))}

      <div>
        <h3 className={HEADING}>Overall recommendation</h3>
        <div className="mt-2 flex gap-2">
          {RECOMMENDATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setOverall(option.value)}
              aria-pressed={overall === option.value}
              className={pillClass(
                overall === option.value,
                "rounded-lg px-2.5 py-1.5 text-xs font-medium",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhaseBlock({ rubric }: { rubric: PhaseRubric }) {
  const phase = rubric.phase;
  const score = useScorecardStore((s) => s.scorecard.rubricScores[phase].score);
  const feedbackMd = useScorecardStore(
    (s) => s.scorecard.rubricScores[phase].feedbackMd,
  );
  const setPhaseScore = useScorecardStore((s) => s.setPhaseScore);
  const setPhaseFeedback = useScorecardStore((s) => s.setPhaseFeedback);
  const anchor = rubric.levels.find((l) => l.score === score)?.anchor ?? "";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={HEADING}>{rubric.title}</h3>
        <span className="text-[10px] text-neutral-500">{rubric.focus}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {SCORES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPhaseScore(phase, value)}
            aria-label={`${rubric.title} score ${value}`}
            aria-pressed={score === value}
            className={pillClass(
              score === value,
              "h-7 w-7 rounded text-xs font-semibold",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-8 text-[11px] leading-snug text-neutral-400">
        {anchor}
      </p>
      <textarea
        value={feedbackMd}
        onChange={(event) => setPhaseFeedback(phase, event.target.value)}
        placeholder="Feedback (markdown)…"
        rows={3}
        spellCheck={false}
        className={TEXTAREA}
        aria-label={`${rubric.title} feedback`}
      />
    </div>
  );
}
