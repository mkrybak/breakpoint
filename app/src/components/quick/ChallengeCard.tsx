"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Circle,
  CircleCheck,
  Lightbulb,
  Target,
  Trophy,
} from "lucide-react";
import {
  challengeSolvedBy,
  describeNudge,
} from "@/components/quick/challenge-nudge";
import { switchQuickScenario } from "@/components/quick/quick-actions";
import {
  getQuickScenario,
  QUICK_CHALLENGES,
  type QuickChallenge,
} from "@/lib/scenarios";
import {
  loadSolvedChallenges,
  markChallengeSolved,
} from "@/persistence/challenges";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

const EYEBROW =
  "flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase";
const GOAL = "mt-1 text-sm font-medium text-neutral-100";
const MUTED = "mt-1 text-xs text-neutral-400";
const BUSY_TITLE = "Stop the run to switch challenges";

/** Quick mode's challenge card: the next-challenge nudge plus the full ordered list (T-7.6). */
export function ChallengeCard() {
  const status = useSimStore((s) => s.status);
  const result = useSimStore((s) => s.result);
  const runScenario = useSimStore((s) => s.runScenario);
  const scenarioId = useScenarioStore((s) => s.scenario.id);
  const [solved, setSolved] = useState<readonly string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // localStorage is read after mount (SSR renders [] → no hydration
    // mismatch, as in LandingScreen); a finished passing challenge run is
    // recorded here, once per result.
    const just = challengeSolvedBy(QUICK_CHALLENGES, result, runScenario);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSolved(
      just ? markChallengeSolved(just.scenarioId) : loadSolvedChallenges(),
    );
  }, [result, runScenario]);

  const view = describeNudge({
    challenges: QUICK_CHALLENGES,
    solved,
    scenarioId,
    status,
    result,
    runScenario,
  });
  const busy = status === "running" || status === "paused";
  const pick = (id: string) => {
    const scenario = getQuickScenario(id);
    if (scenario) switchQuickScenario(scenario);
  };
  // a just-solved challenge counts on the same render, before the effect lands
  const shownSolved =
    view.kind === "solved" && !solved.includes(view.challenge.scenarioId)
      ? [...solved, view.challenge.scenarioId]
      : solved;
  const shownSolvedCount = QUICK_CHALLENGES.filter((c) =>
    shownSolved.includes(c.scenarioId),
  ).length;

  return (
    <section
      aria-label="Challenges"
      className="w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="challenge-list"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 px-3 text-left transition-colors duration-150 hover:bg-neutral-800/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-400"
      >
        <Trophy className="h-4 w-4 text-amber-400" aria-hidden />
        <span className="text-xs font-semibold tracking-wide text-neutral-200 uppercase">
          Challenges
        </span>
        <span className="ml-auto font-mono text-xs text-neutral-400">
          {shownSolvedCount}/{QUICK_CHALLENGES.length} solved
        </span>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform duration-150${open ? " rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {view.kind !== "none" && (
        <div
          className="border-t border-neutral-800 px-3 py-3"
          aria-live="polite"
        >
          {view.kind === "active" && (
            <>
              <p className={`${EYEBROW} text-sky-300`}>
                <Target className="h-3.5 w-3.5" aria-hidden />
                Current challenge
              </p>
              <p className={GOAL}>{view.challenge.goal}</p>
              <p className={MUTED}>
                {view.running
                  ? "In progress. The verdict decides."
                  : "Press Run to take it on."}
              </p>
            </>
          )}

          {view.kind === "solved" && (
            <>
              <p className={`${EYEBROW} text-green-400`}>
                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                Solved
              </p>
              <p className={GOAL}>{view.challenge.goal}</p>
              {view.next ? (
                <NextUp challenge={view.next} busy={busy} onPick={pick} />
              ) : (
                <p className={MUTED}>
                  That was the last one. Every challenge solved.
                </p>
              )}
            </>
          )}

          {view.kind === "retry" && view.stopped && (
            <>
              <p className={`${EYEBROW} text-neutral-400`}>Run stopped early</p>
              <p className={GOAL}>{view.challenge.goal}</p>
              <p className={MUTED}>Let the run finish for it to count.</p>
            </>
          )}

          {view.kind === "retry" && !view.stopped && (
            <>
              <p className={`${EYEBROW} text-amber-300`}>
                <Lightbulb className="h-3.5 w-3.5" aria-hidden />
                Not yet
              </p>
              <p className={GOAL}>{view.challenge.goal}</p>
              {view.challenge.hint && (
                <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
                  {view.challenge.hint}
                </p>
              )}
              <p className={MUTED}>Change the design, then Re-run.</p>
            </>
          )}

          {view.kind === "suggest" && (
            <>
              {view.passed ? (
                <p className={`${EYEBROW} text-green-400`}>
                  <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                  Your design held
                </p>
              ) : (
                <p className={`${EYEBROW} text-neutral-400`}>
                  Ready for a challenge?
                </p>
              )}
              <NextUp challenge={view.next} busy={busy} onPick={pick} />
            </>
          )}

          {view.kind === "all-done" && (
            <>
              <p className={`${EYEBROW} text-green-400`}>
                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                All challenges solved
              </p>
              <p className={MUTED}>
                Keep tinkering, or use Break it to throw your own chaos at the
                design.
              </p>
            </>
          )}
        </div>
      )}

      {open && (
        <ol id="challenge-list" className="border-t border-neutral-800 p-1.5">
          {QUICK_CHALLENGES.map((c, i) => {
            const current = c.scenarioId === scenarioId;
            const isSolved = shownSolved.includes(c.scenarioId);
            return (
              <li key={c.scenarioId}>
                <button
                  type="button"
                  onClick={() => pick(c.scenarioId)}
                  disabled={busy || current}
                  aria-current={current ? "true" : undefined}
                  title={busy ? BUSY_TITLE : undefined}
                  className={`flex min-h-8 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    current
                      ? "bg-sky-500/10 text-sky-100"
                      : "text-neutral-300 enabled:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  }`}
                >
                  {isSolved ? (
                    <CircleCheck
                      className="h-4 w-4 shrink-0 text-green-400"
                      aria-hidden
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 shrink-0 text-neutral-600"
                      aria-hidden
                    />
                  )}
                  <span className="sr-only">
                    {isSolved ? "Solved:" : "Not solved:"}
                  </span>
                  <span className="font-mono text-neutral-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">{c.goal}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function NextUp({
  challenge,
  busy,
  onPick,
}: {
  challenge: QuickChallenge;
  busy: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-3 border-t border-neutral-800 pt-3">
      <p className={`${EYEBROW} text-neutral-400`}>Next up</p>
      <p className={GOAL}>{challenge.goal}</p>
      <button
        type="button"
        onClick={() => onPick(challenge.scenarioId)}
        disabled={busy}
        title={busy ? BUSY_TITLE : undefined}
        className="mt-2 flex h-8 items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 text-xs font-medium text-sky-200 transition-colors duration-150 enabled:hover:border-sky-400 enabled:hover:bg-sky-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Try it <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
