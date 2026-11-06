"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap } from "lucide-react";
import { newPracticeDesign } from "@/components/landing/new-design";
import { saveDesign } from "@/persistence/local";
import { usePhaseStore } from "@/stores/phase-store";

/**
 * Quick → Practice (T-7.7): starts a *new* blank Practice design, never a
 * conversion (product-modes spec, "Moving between modes"). Same record as the
 * landing Practice card with an empty name.
 */
export function TryPracticeLink() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const onClick = () => {
    if (opening) return;
    setOpening(true);
    const record = newPracticeDesign(crypto.randomUUID(), "");
    saveDesign(record);
    // The phase clock is global and nothing else resets it: a new interview
    // starts at Requirements with a full budget. Sim + scenario are reset by
    // QuickWorkspace's unmount (leaveQuickMode, T-7.5).
    usePhaseStore.getState().reset();
    router.push(`/design/${record.id}`);
  };

  return (
    <section
      aria-labelledby="try-practice-title"
      className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
    >
      <div className="flex items-center gap-2">
        <GraduationCap
          className="h-4 w-4 shrink-0 text-neutral-400"
          aria-hidden
        />
        <h2
          id="try-practice-title"
          className="text-xs font-semibold tracking-wide text-neutral-400 uppercase"
        >
          Practice mode
        </h2>
      </div>
      <p className="mt-2 text-xs leading-snug text-neutral-400">
        Ready for the real thing? Run the full interview: timed phases,
        requirements, notes and a self-review scorecard.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={opening}
        className="group mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-200 transition-colors duration-150 hover:border-neutral-500 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-wait disabled:opacity-60"
      >
        Try a full practice interview
        <ArrowRight
          className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
      <p className="mt-2 text-[11px] leading-snug text-neutral-400">
        Opens a new blank design. This one stays in your saved designs.
      </p>
    </section>
  );
}
