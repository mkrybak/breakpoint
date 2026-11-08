"use client";

import { Trash2 } from "lucide-react";
import type { RelationKind } from "@/lib/core";
import { RELATION_KINDS } from "@/persistence/boards";
import { useDesignStore } from "@/stores/design-store";
import { RELATION_KIND_LABEL } from "./entity-flow";
import { RelationKindIcon } from "./RelationKindIcon";

/** Edit mode only: the four relation kinds as icons, plus delete. */
export function RelationKindPicker({
  relationId,
  kind,
  onDone,
}: {
  relationId: string;
  kind: RelationKind;
  onDone: () => void;
}) {
  const setRelationKind = useDesignStore((s) => s.setRelationKind);
  const removeRelation = useDesignStore((s) => s.removeRelation);
  return (
    <div
      role="group"
      aria-label="Relationship type"
      className="flex items-center gap-0.5 rounded-lg border border-sky-400 bg-neutral-900 p-1 shadow-md"
    >
      {RELATION_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          aria-label={RELATION_KIND_LABEL[k]}
          title={RELATION_KIND_LABEL[k]}
          aria-pressed={k === kind}
          onClick={() => {
            setRelationKind(relationId, k);
            onDone();
          }}
          className={`rounded px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-sky-300 ${
            k === kind
              ? "bg-sky-500/20 text-sky-200"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <RelationKindIcon kind={k} />
        </button>
      ))}
      <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-700" />
      <button
        type="button"
        aria-label="Delete relationship"
        title="Delete relationship"
        onClick={() => {
          removeRelation(relationId);
          onDone();
        }}
        className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-rose-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
