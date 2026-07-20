"use client";

import { useEffect, useRef } from "react";
import type { Phase, Scenario } from "@/lib/core";
import { noteEditedAction } from "@/lib/actions";
import { recordInterviewAction, useDesignStore } from "@/stores/design-store";
import { phaseConfig, usePhaseStore } from "@/stores/phase-store";
import { useScenarioStore } from "@/stores/scenario-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const TEXTAREA =
  "mt-2 w-full resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-mono text-xs leading-relaxed text-neutral-100";
const NOTE_RECORD_DEBOUNCE_MS = 1000;

/** Placeholder prompt per phase — what the candidate should capture there. */
const PROMPTS: Record<Phase, string> = {
  requirements:
    "Functional requirements and non-functional requirements (NFRs)…",
  entities: "Core entities and their key fields…",
  api: "API sketch — endpoints, request / response shapes…",
  hld: "High-level design notes — components and data flow…",
  deepdive: "Deep dives and stress-test reasoning…",
};

/** Markdown starting point for the Requirements note, from the scenario NFRs. */
export function nfrNotesTemplate(scenario: Scenario): string {
  const { baseRps, pass } = scenario;
  const errorPct = Math.round(pass.maxErrorRate * 1000) / 10;
  const consistency = pass.consistency === "strong" ? "Strong" : "Eventual";
  return [
    "## Non-functional requirements",
    `- Target load: ${baseRps} RPS`,
    `- p95 latency budget: ${pass.p95Ms} ms`,
    `- Max error rate: ${errorPct}%`,
    `- Consistency: ${consistency}`,
    "",
    "## Functional requirements",
    "- ",
    "",
  ].join("\n");
}

export function PhaseNotes() {
  const phase = usePhaseStore((s) => s.phase);
  const designId = useDesignStore((s) => s.designId);
  const note = useDesignStore((s) => s.phaseNotes[phase]);
  const setPhaseNote = useDesignStore((s) => s.setPhaseNote);

  // Seed the Requirements note from the scenario NFRs, once, when it is empty.
  // Gated on designId so it runs after attachDesign has loaded any saved note
  // (avoids seeding, then having attach overwrite it back to empty). Reading the
  // stores via getState() keeps this out of the effect's dependency array so a
  // scenario edit or a keystroke never re-seeds. Zustand actions are not React
  // setState, so this does not trip react-hooks/set-state-in-effect.
  useEffect(() => {
    if (phase !== "requirements" || designId === null) return;
    const { phaseNotes, setPhaseNote: seed } = useDesignStore.getState();
    if (phaseNotes.requirements.trim() !== "") return;
    seed("requirements", nfrNotesTemplate(useScenarioStore.getState().scenario));
  }, [phase, designId]);

  const recordTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(recordTimer.current), []);

  // Debounced: one note_edited per burst of typing (not per keystroke).
  const onNoteChange = (value: string) => {
    setPhaseNote(phase, value);
    clearTimeout(recordTimer.current);
    recordTimer.current = setTimeout(() => {
      recordInterviewAction(noteEditedAction());
    }, NOTE_RECORD_DEBOUNCE_MS);
  };

  return (
    <section>
      <h2 className={HEADING}>Notes — {phaseConfig(phase).label}</h2>
      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={PROMPTS[phase]}
        rows={10}
        spellCheck={false}
        className={TEXTAREA}
        aria-label={`Phase notes for ${phaseConfig(phase).label}`}
      />
    </section>
  );
}
