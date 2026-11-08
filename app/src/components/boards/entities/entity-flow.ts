import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import type {
  BoardPosition,
  EntitiesBoard as EntitiesBoardData,
  EntityBox,
  EntityRelation,
  RelationKind,
} from "@/lib/core";
import type { NodeMeasurements } from "@/stores/flow-adapter";

/** Pure helpers for the Entities board (M13, T-13.4): no React, no store. */

export type EntityNodeData = { entity: EntityBox };
export type EntityFlowNode = Node<EntityNodeData, "entity">;
export type RelationEdgeData = { kind: RelationKind };
export type RelationFlowEdge = Edge<RelationEdgeData, "relation">;
export interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type Cardinality = "one" | "many";

export const ENTITY_WIDTH = 224; // w-56; both modes
export const NEW_ENTITY_HEIGHT = 120; // size estimate before React Flow measures a box
export const SPOT_GAP = 32;
export const SPOT_PAD = 24;
export const FIELD_TYPE_SUGGESTIONS = [
  "uuid",
  "string",
  "text",
  "int",
  "bigint",
  "float",
  "decimal",
  "bool",
  "timestamp",
  "date",
  "enum",
  "json",
] as const;
export const RELATION_KIND_LABEL: Record<RelationKind, string> = {
  "one-to-one": "One-to-one",
  "one-to-many": "One-to-many",
  "many-to-one": "Many-to-one",
  "many-to-many": "Many-to-many",
};

/** Cardinality at each end, read from → to. */
export function relationEnds(kind: RelationKind): { from: Cardinality; to: Cardinality } {
  const [from, to] = kind.split("-to-") as [Cardinality, Cardinality];
  return { from, to };
}

/** Crow's-foot glyph at a line end. (x, y) = the handle point on the box border; outward = +1 when the line leaves to the right, -1 to the left. */
export function endGlyphPath(end: Cardinality, x: number, y: number, outward: 1 | -1): string {
  const o = outward;
  if (end === "one") return `M ${x + o * 10} ${y - 6} L ${x + o * 10} ${y + 6}`;
  const tip = x + o * 14;
  return `M ${tip} ${y} L ${x} ${y - 6} M ${tip} ${y} L ${x} ${y} M ${tip} ${y} L ${x} ${y + 6}`;
}

/** Self-relation loop: out the right side, over the box top, into the left side. Same tuple shape as getBezierPath's first three. */
export function selfLoopPath(p: {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  top: number;
}): [string, number, number] {
  const lift = p.top - 24;
  return [
    `M ${p.sx} ${p.sy} H ${p.sx + 20} V ${lift} H ${p.tx - 20} V ${p.ty} H ${p.tx}`,
    (p.sx + p.tx) / 2,
    lift,
  ];
}

export function toEntityFlow(
  board: EntitiesBoardData,
  measured: NodeMeasurements,
  selected: ReadonlySet<string>,
): { nodes: EntityFlowNode[]; edges: RelationFlowEdge[] } {
  return {
    nodes: board.entities.map((e) => ({
      id: e.id,
      type: "entity",
      position: e.position,
      data: { entity: e },
      selected: selected.has(e.id),
      measured: measured[e.id],
    })),
    edges: board.relations.map((r) => ({
      id: r.id,
      type: "relation",
      source: r.from,
      target: r.to,
      selected: selected.has(r.id),
      data: { kind: r.kind },
    })),
  };
}

/** True if a and b are already related, in either direction. */
export function isDuplicatePair(relations: readonly EntityRelation[], a: string, b: string): boolean {
  return relations.some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

export function entityRect(e: EntityBox, measured: NodeMeasurements): FlowRect {
  const size = measured[e.id] ?? { width: ENTITY_WIDTH, height: NEW_ENTITY_HEIGHT };
  return { x: e.position.x, y: e.position.y, width: size.width, height: size.height };
}

function overlaps(a: FlowRect, b: FlowRect, g: number): boolean {
  return (
    a.x < b.x + b.width + g &&
    b.x < a.x + a.width + g &&
    a.y < b.y + b.height + g &&
    b.y < a.y + a.height + g
  );
}

/** First free grid cell inside the visible view; otherwise to the right of every box (inView false → the caller pans to it). */
export function freeSpot(
  occupied: readonly FlowRect[],
  view: FlowRect,
): { position: BoardPosition; inView: boolean } {
  const colStep = ENTITY_WIDTH + SPOT_GAP;
  const rowStep = NEW_ENTITY_HEIGHT + SPOT_GAP;
  const cols = Math.max(1, Math.floor((view.width - 2 * SPOT_PAD + SPOT_GAP) / colStep));
  const rows = Math.max(1, Math.floor((view.height - 2 * SPOT_PAD + SPOT_GAP) / rowStep));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cand: FlowRect = {
        x: Math.round(view.x + SPOT_PAD + col * colStep),
        y: Math.round(view.y + SPOT_PAD + row * rowStep),
        width: ENTITY_WIDTH,
        height: NEW_ENTITY_HEIGHT,
      };
      if (!occupied.some((o) => overlaps(cand, o, SPOT_GAP))) {
        return { position: { x: cand.x, y: cand.y }, inView: true };
      }
    }
  }
  return {
    position: {
      x: Math.round(Math.max(view.x, ...occupied.map((o) => o.x + o.width)) + SPOT_GAP),
      y: Math.round(view.y + SPOT_PAD),
    },
    inView: false,
  };
}

export interface NodeChangeOps {
  dimensions: NodeMeasurements;
  moves: { id: string; position: BoardPosition }[];
  removes: string[];
  selection: Record<string, boolean>;
}

export function splitNodeChanges(changes: readonly NodeChange<EntityFlowNode>[]): NodeChangeOps {
  const ops: NodeChangeOps = { dimensions: {}, moves: [], removes: [], selection: {} };
  for (const change of changes) {
    switch (change.type) {
      case "dimensions":
        if (change.dimensions) {
          ops.dimensions[change.id] = {
            width: change.dimensions.width,
            height: change.dimensions.height,
          };
        }
        break;
      case "position":
        if (change.position) {
          ops.moves.push({
            id: change.id,
            position: { x: Math.round(change.position.x), y: Math.round(change.position.y) },
          });
        }
        break;
      case "remove":
        ops.removes.push(change.id);
        break;
      case "select":
        ops.selection[change.id] = change.selected;
        break;
    }
  }
  return ops;
}

export function splitEdgeChanges(changes: readonly EdgeChange<RelationFlowEdge>[]): {
  removes: string[];
  selection: Record<string, boolean>;
} {
  const ops = { removes: [] as string[], selection: {} as Record<string, boolean> };
  for (const change of changes) {
    if (change.type === "remove") ops.removes.push(change.id);
    else if (change.type === "select") ops.selection[change.id] = change.selected;
  }
  return ops;
}

/** Selection set after applying flags; returns `prev` itself when nothing changes. */
export function applySelection(
  prev: ReadonlySet<string>,
  flags: Record<string, boolean>,
): ReadonlySet<string> {
  let next: Set<string> | null = null;
  for (const [id, on] of Object.entries(flags)) {
    if (on === (next ?? prev).has(id)) continue;
    next ??= new Set(prev);
    if (on) next.add(id);
    else next.delete(id);
  }
  return next ?? prev;
}

/** Which end a reconnect drag moved (compare ids; at most one end changes per drag). */
export function reconnectOps(
  old: { source: string; target: string },
  next: { source: string; target: string },
): { end: "from" | "to"; entityId: string }[] {
  const ops: { end: "from" | "to"; entityId: string }[] = [];
  if (next.source !== old.source) ops.push({ end: "from", entityId: next.source });
  if (next.target !== old.target) ops.push({ end: "to", entityId: next.target });
  return ops;
}

export function toolbarHint(entityCount: number, relationCount: number): string {
  if (entityCount === 0) {
    return "Add the core entities, then drag from a box's right dot onto another box to relate them.";
  }
  if (relationCount === 0) {
    return "Drag from a box's right dot onto another box (or itself) to relate them. Click a line to set its type.";
  }
  return "Click a line to change its type. Drag a line's end onto another box to re-point it.";
}

/** Final index of an item dragged from `fromIndex` into the gap before `gapIndex`. */
export function dropIndex(fromIndex: number, gapIndex: number): number {
  return gapIndex > fromIndex ? gapIndex - 1 : gapIndex;
}
