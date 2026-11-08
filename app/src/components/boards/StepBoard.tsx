"use client";

import type { ComponentType } from "react";
import type { BoardPhase, Phase } from "@/lib/core";
import { phaseConfig } from "@/stores/phase-store";
import { ApiBoard } from "./api/ApiBoard";
import { EntityNamesPanel } from "./api/EntityNamesPanel";
import { EntitiesBoard } from "./entities/EntitiesBoard";
import { RequirementsBoard } from "./RequirementsBoard";

/** The center board for a step before High-level design (M13). */
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
      return <EntitiesBoard />;
    case "api":
      return <ApiBoard />;
  }
}

/** Right-column extras per viewed step, rendered above the notes. */
const STEP_ASIDES: Partial<Record<Phase, ComponentType>> = {
  api: EntityNamesPanel,
};

export function StepAside({ phase }: { phase: Phase }) {
  const Aside = STEP_ASIDES[phase];
  return Aside ? <Aside /> : null;
}
