"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  buildDesignRecord,
  deleteDesign,
  listDesigns,
  renameDesign,
  saveDesign,
  type DesignRecord,
} from "@/persistence/local";

const CARD = "rounded-xl border border-neutral-800 bg-neutral-900/60";
const BTN =
  "flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500";
const INPUT =
  "rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500";

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function LandingScreen() {
  const router = useRouter();
  // null = not yet loaded (SSR + first client render match → no hydration mismatch)
  const [designs, setDesigns] = useState<DesignRecord[] | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const reload = () => setDesigns(listDesigns());
  useEffect(() => {
    // Reading localStorage on mount, not deriving from props/state — the
    // effect-free alternatives (lazy useState initializer) would run on the
    // client's hydration pass too, mismatching the null-state SSR output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesigns(listDesigns());
  }, []);

  const onCreate = () => {
    const id = crypto.randomUUID();
    const name = newName.trim() || "Untitled design";
    saveDesign(
      buildDesignRecord(id, name, { nodes: [], edges: [], entryNodeId: "" }),
    );
    router.push(`/design/${id}`);
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
      <div className="w-full max-w-2xl px-6 py-16">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Breakpoint</h1>
          <p className="mt-1 text-sm text-neutral-400">
            System design interviews with a live stress test. Open a saved design
            or start a new one.
          </p>
        </header>

        <div className={`${CARD} mb-8 flex items-center gap-2 p-3`}>
          <input
            className={`${INPUT} flex-1`}
            placeholder="New design name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreate();
            }}
          />
          <button type="button" onClick={onCreate} className={BTN}>
            <Plus className="h-3.5 w-3.5" /> New design
          </button>
        </div>

        {designs === null ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : designs.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No saved designs yet — create one above to start.
          </p>
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
                      className={BTN}
                      aria-label="Save name"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className={BTN}
                      aria-label="Cancel rename"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/design/${d.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {d.name}
                      </Link>
                      <p className="text-xs text-neutral-500">
                        Updated {formatUpdatedAt(d.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/review/${d.id}`} className={BTN}>
                      Review
                    </Link>
                    <button
                      type="button"
                      onClick={() => startRename(d)}
                      className={BTN}
                      aria-label="Rename design"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d.id)}
                      className={BTN}
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
      </div>
    </main>
  );
}
