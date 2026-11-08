"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, Upload, X } from "lucide-react";
import { ModeBadge } from "@/components/landing/ModeBadge";
import { ModeCards } from "@/components/landing/ModeCards";
import { ScenarioCards } from "@/components/landing/ScenarioCards";
import {
  importAsNewDesign,
  newPracticeDesign,
  newQuickDesign,
} from "./new-design";
import { BTN, CARD, FOCUS, HEADING, ICON_BTN, INPUT } from "./styles";
import {
  deleteDesign,
  listDesigns,
  parseDesignRecord,
  renameDesign,
  saveDesign,
  type DesignRecord,
} from "@/persistence/local";
import { usePhaseStore } from "@/stores/phase-store";

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function LandingScreen() {
  const router = useRouter();
  // null = not yet loaded (SSR + first client render match → no hydration mismatch)
  const [designs, setDesigns] = useState<DesignRecord[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [creating, setCreating] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => setDesigns(listDesigns());
  useEffect(() => {
    // Reading localStorage on mount, not deriving from props/state — the
    // effect-free alternatives (lazy useState initializer) would run on the
    // client's hydration pass too, mismatching the null-state SSR output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesigns(listDesigns());
  }, []);

  const openNew = (record: DesignRecord) => {
    saveDesign(record);
    // the phase clock is a global store: a new design starts at Requirements
    usePhaseStore.getState().reset();
    router.push(`/design/${record.id}`);
  };
  const onStartQuick = () => {
    if (creating) return;
    setCreating(true);
    openNew(
      newQuickDesign(
        crypto.randomUUID(),
        listDesigns().map((d) => d.name),
      ),
    );
  };
  const onCreatePractice = (name: string) => {
    if (creating) return;
    setCreating(true);
    openNew(newPracticeDesign(crypto.randomUUID(), name));
  };
  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const parsed = parseDesignRecord(await file.text());
    if (parsed === null) {
      setImportError("Not a valid design file");
      return;
    }
    setImportError(null);
    openNew(importAsNewDesign(parsed, crypto.randomUUID()));
  };

  const startRename = (record: DesignRecord) => {
    setEditingId(record.id);
    setEditingName(record.name);
  };
  const commitRename = () => {
    if (editingId) renameDesign(editingId, editingName);
    setEditingId(null);
    reload();
  };
  const onDelete = (id: string) => {
    if (!window.confirm("Delete this design? This cannot be undone.")) return;
    deleteDesign(id);
    reload();
  };

  return (
    <main className="flex flex-1 flex-col items-center bg-neutral-950 text-neutral-100">
      <div className="w-full max-w-3xl px-6 py-16">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">BreakMyDesign</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Build a system and stress-test it live. Start with a quick
            simulation, or practice a full interview.
          </p>
        </header>

        <ModeCards
          creating={creating}
          onStartQuick={onStartQuick}
          onCreatePractice={onCreatePractice}
        />

        <section aria-labelledby="designs-heading" className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="designs-heading" className={HEADING}>
              Your designs
            </h2>
            <button
              type="button"
              className={BTN}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden /> Import design
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => void onImportFile(event)}
            />
          </div>
          {importError !== null && (
            <p role="alert" className="mb-3 text-xs text-red-400">
              {importError}
            </p>
          )}

          {designs === null ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : designs.length === 0 ? (
            <div className={`${CARD} px-4 py-8 text-center`}>
              <p className="text-sm font-medium text-neutral-300">
                No saved designs yet
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Start a quick simulation or a practice design above, or import a
                design file.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {designs.map((d) => (
                <li key={d.id} className={`${CARD} flex items-center gap-3 p-3`}>
                  {editingId === d.id ? (
                    <>
                      <input
                        className={`${INPUT} flex-1`}
                        value={editingName}
                        autoFocus
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        type="button"
                        onClick={commitRename}
                        className={ICON_BTN}
                        aria-label="Save name"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className={ICON_BTN}
                        aria-label="Cancel rename"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/design/${d.id}`}
                            className={`min-w-0 truncate rounded text-sm font-medium hover:underline ${FOCUS}`}
                          >
                            {d.name}
                          </Link>
                          <ModeBadge mode={d.mode} />
                        </div>
                        <p className="text-xs text-neutral-500">
                          Updated {formatUpdatedAt(d.updatedAt)}
                        </p>
                      </div>
                      {d.mode !== "quick" && (
                        <Link href={`/review/${d.id}`} className={BTN}>
                          Review
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => startRename(d)}
                        className={ICON_BTN}
                        aria-label="Rename design"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(d.id)}
                        className={ICON_BTN}
                        aria-label="Delete design"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <ScenarioCards />
      </div>
    </main>
  );
}
