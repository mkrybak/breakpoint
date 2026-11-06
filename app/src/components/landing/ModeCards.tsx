"use client";

import { useState } from "react";
import { ArrowRight, GraduationCap, Plus, Users, Zap } from "lucide-react";
import { BTN, CARD, FOCUS, HEADING, INPUT } from "./styles";

const ICON_TILE =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-300";

export interface ModeCardsProps {
  /** true after a create click, until navigation: blocks double-creates. */
  creating: boolean;
  onStartQuick: () => void;
  onCreatePractice: (name: string) => void;
}

/** Landing mode cards (T-7.4): Quick hero, Practice create flow, Interview teaser. */
export function ModeCards({ creating, onStartQuick, onCreatePractice }: ModeCardsProps) {
  const [practiceName, setPracticeName] = useState("");

  return (
    <section aria-labelledby="modes-heading" className="mb-10">
      <h2 id="modes-heading" className={`${HEADING} mb-3`}>
        Start something
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* 1. Quick — the whole card is the one-click button */}
        <button
          type="button"
          onClick={onStartQuick}
          disabled={creating}
          aria-labelledby="mode-quick-title"
          aria-describedby="mode-quick-desc"
          className={`group flex w-full items-center gap-4 rounded-xl border border-sky-500/50 bg-sky-500/10 p-5 text-left transition-colors duration-150 hover:border-sky-400 hover:bg-sky-500/15 disabled:cursor-wait disabled:opacity-70 sm:col-span-2 ${FOCUS}`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-300">
            <Zap className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span
                id="mode-quick-title"
                className="text-base font-semibold text-neutral-50"
              >
                Quick simulation
              </span>
              <span className="rounded-full border border-sky-500/40 px-2 py-0.5 text-[10px] font-medium tracking-wide text-sky-300 uppercase">
                Start here
              </span>
            </span>
            <span id="mode-quick-desc" className="mt-1 block text-sm text-neutral-300">
              A working Client → App server → SQL database design, ready to run.
              Press Run, watch the traffic flow, then try to break it.
            </span>
          </span>
          <span
            aria-hidden
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-200 transition-colors duration-150 group-hover:border-sky-400"
          >
            {creating ? "Opening…" : "Start"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </button>

        {/* 2. Practice — today's create flow */}
        <div className={`${CARD} flex flex-col p-4`}>
          <div className="flex items-center gap-3">
            <span className={ICON_TILE}>
              <GraduationCap className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-neutral-100">
              Practice interview
            </h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            The full structured interview on a blank canvas: timed phases,
            requirements, stress tests and a self-review scorecard.
          </p>
          <form
            className="mt-auto flex gap-2 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              onCreatePractice(practiceName);
            }}
          >
            <input
              className={`${INPUT} min-w-0 flex-1`}
              placeholder="Design name (optional)"
              aria-label="Practice design name"
              value={practiceName}
              onChange={(e) => setPracticeName(e.target.value)}
            />
            <button type="submit" className={BTN} disabled={creating}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> New design
            </button>
          </form>
        </div>

        {/* 3. Interview — roadmap teaser, no controls (not a disabled panel) */}
        <div className={`${CARD} flex flex-col p-4`}>
          <div className="flex items-center gap-3">
            <span className={ICON_TILE}>
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="text-sm font-semibold text-neutral-100">Live interview</h3>
            <span className="ml-auto rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-[10px] font-medium tracking-wide text-neutral-300 uppercase">
              Coming soon
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            An interviewer and a candidate in one shared session. The candidate
            builds while the interviewer runs the clock, picks the stress test
            and grades.
          </p>
          <p className="mt-auto pt-4 text-xs text-neutral-400">
            On the roadmap. For now, run a practice interview and share its
            exported run file.
          </p>
        </div>
      </div>
    </section>
  );
}
