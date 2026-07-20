"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { parseRunBundle, saveDesign } from "@/persistence/local";
import { saveScorecard } from "@/persistence/scorecard";
import { useDesignStore } from "@/stores/design-store";
import { useScorecardStore } from "@/stores/scorecard-store";
import { useSimStore } from "@/stores/sim-store";

export function ImportDropzone() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const ingest = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("Could not read that file.");
      return;
    }
    const parsed = parseRunBundle(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    const { bundle } = parsed;
    // Persist so a later reload rehydrates; hydrate the stores now so the review
    // renders immediately; navigate so the URL-keyed pieces (Scorecard id, links)
    // point at the imported design.
    saveDesign(bundle.design);
    if (bundle.scorecard) saveScorecard(bundle.design.id, bundle.scorecard);
    useSimStore.getState().loadResult(bundle.result, bundle.scenario);
    useDesignStore.getState().attachDesign(bundle.design.id);
    useScorecardStore.getState().attach(bundle.design.id);
    router.push(`/review/${bundle.design.id}`);
  };

  return (
    <div className="w-full max-w-md">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void ingest(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-sky-500 bg-sky-500/10"
            : "border-neutral-700 bg-neutral-900/60 hover:border-neutral-500"
        }`}
      >
        <Upload className="h-6 w-6 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200">
          Drop a run bundle here, or click to choose
        </span>
        <span className="text-xs text-neutral-500">
          A <code>.breakpoint.json</code> file exported from an interview
        </span>
        <input
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            void ingest(file);
          }}
        />
      </label>
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
