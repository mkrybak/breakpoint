"use client";

import { useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { ApiBoard as ApiBoardData } from "@/lib/core";
import { useDesignStore } from "@/stores/design-store";
import { EndpointCard, ReadOnlyEndpointCard } from "./EndpointCard";

export type ApiBoardProps = { readOnly?: false } | { readOnly: true; board: ApiBoardData };

/** Same as PhaseBar's button. */
const BTN =
  "flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40";
const EMPTY =
  "rounded-lg border border-dashed border-neutral-800 p-6 text-center text-xs text-neutral-500";

/** The API step board (M13): one card per endpoint, editable or read-only (review). */
export function ApiBoard(props: ApiBoardProps) {
  return props.readOnly ? <ReadOnlyApi board={props.board} /> : <ApiEditor />;
}

function ApiHeader({ hint, children }: { hint: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold text-neutral-200">API</h2>
      <p className="text-xs text-neutral-500">{hint}</p>
      {children}
    </div>
  );
}

function ReadOnlyApi({ board }: { board: ApiBoardData }) {
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-6">
      <ApiHeader hint="One card per endpoint clients call." />
      {board.endpoints.length === 0 ? (
        <p className={EMPTY}>No endpoints.</p>
      ) : (
        <ol aria-label="Endpoints" className="space-y-3">
          {board.endpoints.map((ep, i) => (
            <ReadOnlyEndpointCard key={ep.id} endpoint={ep} index={i} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ApiEditor() {
  const endpoints = useDesignStore((s) => s.boards.api.endpoints);
  const addEndpoint = useDesignStore((s) => s.addEndpoint);
  const [focusId, setFocusId] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const add = () => setFocusId(addEndpoint());

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-6">
      <ApiHeader hint="One card per endpoint clients call. Ctrl/⌘+Enter in a card adds another.">
        <button
          ref={addRef}
          type="button"
          onClick={add}
          aria-label="Add endpoint"
          className={`ml-auto min-h-8 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${BTN}`}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Endpoint
        </button>
      </ApiHeader>
      {endpoints.length === 0 ? (
        <p className={EMPTY}>
          No endpoints yet. Add one per call clients make, e.g. POST /v1/orders → 201.
        </p>
      ) : (
        <ol aria-label="Endpoints" className="space-y-3">
          {endpoints.map((ep, i) => (
            <EndpointCard
              key={ep.id}
              endpoint={ep}
              index={i}
              count={endpoints.length}
              readOnly={false}
              autoFocusUrl={ep.id === focusId}
              onAddNext={add}
              onDeleted={() => addRef.current?.focus()}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
