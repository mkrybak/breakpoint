"use client";

import { useEffect, useRef } from "react";
import type { Phase } from "@/lib/core";
import { noteEditedAction } from "@/lib/actions";
import { recordInterviewAction, useDesignStore } from "@/stores/design-store";
import { phaseConfig, usePhaseStore } from "@/stores/phase-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const TEXTAREA =
  "mt-2 w-full resize-y rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 font-mono text-xs leading-relaxed text-neutral-100";
const NOTE_RECORD_DEBOUNCE_MS = 1000;

/** Placeholder prompt per phase — what the candidate should capture there. */
const PROMPTS: Record<Phase, string> = {
  requirements:
    "Anything the lists don't cover: assumptions, open questions, out of scope…",
  entities: "Core entities and their key fields…",
  api: "API sketch — endpoints, request / response shapes…",
  hld: "High-level design notes — components and data flow…",
  deepdive: "Deep dives and stress-test reasoning…",
};

export function PhaseNotes() {
  // Notes follow the viewed step (T-13.2), so typing across a timeout keeps
  // writing into the same step's note.
  const phase = usePhaseStore((s) => s.viewedPhase);
  const note = useDesignStore((s) => s.phaseNotes[phase]);
  const setPhaseNote = useDesignStore((s) => s.setPhaseNote);

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
