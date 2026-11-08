"use client";

import type { ComponentType } from "react";
import type { BoardPhase, Phase } from "@/lib/core";
import { phaseConfig } from "@/stores/phase-store";
import { RequirementsBoard } from "./RequirementsBoard";

/** The center board for a step before High-level design (M13). T-13.3/4/5 each swap one placeholder case for the real board. */
export function StepBoard({ phase }: { phase: BoardPhase }) {
  return (
    <section
      aria-label={`${phaseConfig(phase).label} board`}
      className="h-full overflow-y-auto bg-neutral-950"
    >
      <BoardBody phase={phase} />
    </section>
  );
}

function BoardBody({ phase }: { phase: BoardPhase }) {
  switch (phase) {
    case "requirements":
      return <RequirementsBoard />;
    case "entities":
      return <BoardPlaceholder phase={phase} />; // T-13.4 replaces with <EntitiesBoard /> (./entities/EntitiesBoard)
    case "api":
      return <BoardPlaceholder phase={phase} />; // T-13.5 replaces with <ApiBoard /> (./api/ApiBoard)
  }
}

function BoardPlaceholder({ phase }: { phase: BoardPhase }) {
  const { label } = phaseConfig(phase);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <h2 className="text-sm font-semibold text-neutral-200">{label}</h2>
      <p className="max-w-sm text-xs text-neutral-500">
        The {label} board is on its way. Capture this step in the notes on the
        right for now.
      </p>
    </div>
  );
}

/** Right-column extras per viewed step, rendered above the notes. T-13.5 adds `api: EntityNameList`. */
const STEP_ASIDES: Partial<Record<Phase, ComponentType>> = {};

export function StepAside({ phase }: { phase: Phase }) {
  const Aside = STEP_ASIDES[phase];
  return Aside ? <Aside /> : null;
}
