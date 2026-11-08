import type {
  ApiBoard,
  ApiEndpoint,
  BoardPhase,
  DesignBoards,
  EntitiesBoard,
  EntityBox,
  EntityField,
  EntityRelation,
  HttpMethod,
  Phase,
  RelationKind,
  RequirementItem,
  RequirementListKey,
  RequirementsBoard,
} from "@/lib/core";

/** Practice step boards (M13): constants, defaults and the forgiving load guard. */
export const BOARD_PHASES: readonly BoardPhase[] = ["requirements", "entities", "api"];
export const REQUIREMENT_LISTS: readonly RequirementListKey[] = ["functional", "nonFunctional"];
export const RELATION_KINDS: readonly RelationKind[] = [
  "one-to-one",
  "one-to-many",
  "many-to-one",
  "many-to-many",
];
export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export const DEFAULT_RELATION_KIND: RelationKind = "one-to-many";
export const DEFAULT_ENDPOINT_STATUS = "200";

export function isBoardPhase(phase: Phase): phase is BoardPhase {
  return (BOARD_PHASES as readonly Phase[]).includes(phase);
}

export function emptyBoards(): DesignBoards {
  return {
    requirements: { functional: [], nonFunctional: [], nonFunctionalSeeded: false },
    entities: { entities: [], relations: [] },
    api: { endpoints: [] },
  };
}

/**
 * Forgiving guard for DesignRecord.boards (M13). A missing or malformed board
 * loads empty; a malformed item, an item with a duplicate id (later ones lose)
 * and a relation whose from/to isn't a parsed entity are dropped; unknown keys
 * are dropped. Every object is rebuilt in the key order of the core/boards.ts
 * types (the same order the store's factories use), which is what keeps a
 * save → load round-trip byte-identical. Keep the two in step.
 */
export function parseDesignBoards(value: unknown): DesignBoards {
  if (!isRecord(value)) return emptyBoards();
  return {
    requirements: parseRequirements(value.requirements),
    entities: parseEntities(value.entities),
    api: parseApi(value.api),
  };
}

function parseRequirements(value: unknown): RequirementsBoard {
  if (!isRecord(value)) return emptyBoards().requirements;
  const seen = new Set<string>();
  return {
    functional: parseList(value.functional, parseRequirement, seen),
    nonFunctional: parseList(value.nonFunctional, parseRequirement, seen),
    nonFunctionalSeeded: value.nonFunctionalSeeded === true,
  };
}

function parseRequirement(raw: unknown): RequirementItem | null {
  if (!isRecord(raw)) return null;
  const { id, text } = raw;
  if (typeof id !== "string" || typeof text !== "string") return null;
  return raw.source === "scenario" ? { id, text, source: "scenario" } : { id, text };
}

function parseEntities(value: unknown): EntitiesBoard {
  if (!isRecord(value)) return { entities: [], relations: [] };
  const entities = parseList(value.entities, parseEntity);
  const entityIds = new Set(entities.map((e) => e.id));
  const relations = parseList(value.relations, parseRelation).filter(
    (r) => entityIds.has(r.from) && entityIds.has(r.to),
  );
  return { entities, relations };
}

function parseField(raw: unknown): EntityField | null {
  if (!isRecord(raw)) return null;
  const { id, name, type } = raw;
  if (typeof id !== "string" || typeof name !== "string" || typeof type !== "string") {
    return null;
  }
  return { id, name, type };
}

function parseEntity(raw: unknown): EntityBox | null {
  if (!isRecord(raw)) return null;
  const { id, name, position } = raw;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (!isRecord(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    return null;
  }
  return {
    id,
    name,
    fields: parseList(raw.fields, parseField),
    position: { x: position.x, y: position.y },
  };
}

function parseRelation(raw: unknown): EntityRelation | null {
  if (!isRecord(raw)) return null;
  const { id, from, to, kind } = raw;
  if (typeof id !== "string" || typeof from !== "string" || typeof to !== "string") {
    return null;
  }
  if (!(RELATION_KINDS as readonly unknown[]).includes(kind)) return null;
  return { id, from, to, kind: kind as RelationKind };
}

function parseApi(value: unknown): ApiBoard {
  if (!isRecord(value)) return { endpoints: [] };
  return { endpoints: parseList(value.endpoints, parseEndpoint) };
}

function parseEndpoint(raw: unknown): ApiEndpoint | null {
  if (!isRecord(raw)) return null;
  const { id, method, url, status, requestBody, responseBody } = raw;
  if (typeof id !== "string") return null;
  if (!(HTTP_METHODS as readonly unknown[]).includes(method)) return null;
  if (
    typeof url !== "string" ||
    typeof status !== "string" ||
    typeof requestBody !== "string" ||
    typeof responseBody !== "string"
  ) {
    return null;
  }
  return { id, method: method as HttpMethod, url, status, requestBody, responseBody };
}

/** Parsed items in order; drops nulls and ids already in `seen` (shared across a collection). */
function parseList<T extends { id: string }>(
  value: unknown,
  parseItem: (raw: unknown) => T | null,
  seen = new Set<string>(),
): T[] {
  if (!Array.isArray(value)) return [];
  const items: T[] = [];
  for (const raw of value) {
    const item = parseItem(raw);
    if (item === null || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

// Copies of local.ts's helpers: importing them would make local.ts ↔ boards.ts a cycle.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
