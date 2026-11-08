import type { RelationKind } from "@/lib/core";
import { endGlyphPath, relationEnds } from "./entity-flow";

/** A relation kind drawn as a short line with crow's-foot ends (from on the left, to on the right). */
export function RelationKindIcon({ kind }: { kind: RelationKind }) {
  const ends = relationEnds(kind);
  return (
    <svg
      viewBox="0 0 44 16"
      width={44}
      height={16}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d="M 4 8 L 40 8" />
      <path d={endGlyphPath(ends.from, 4, 8, 1)} />
      <path d={endGlyphPath(ends.to, 40, 8, -1)} />
    </svg>
  );
}
