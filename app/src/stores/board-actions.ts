import type {
  ApiEndpoint,
  BoardPhase,
  BoardPosition,
  DesignBoards,
  EntityBox,
  EntityField,
  EntityRelation,
  RelationKind,
  RequirementItem,
  RequirementListKey,
} from "@/lib/core";
import { DEFAULT_ENDPOINT_STATUS, DEFAULT_RELATION_KIND } from "@/persistence/boards";

/**
 * design-store's step-board actions (M13). No-op calls (unknown id, nothing
 * changed) leave `boards` untouched and record nothing. `toIndex` is the item's
 * final index, clamped. Every factory builds objects in the key order of the
 * core/boards.ts types, the same order persistence/boards.ts's guard rebuilds,
 * so a save → load round-trip is byte-identical.
 */
export interface BoardActions {
  /* Requirements (T-13.3) */
  addRequirement: (list: RequirementListKey, afterId?: string | null, text?: string) => string;
  updateRequirement: (list: RequirementListKey, id: string, text: string) => void;
  removeRequirement: (list: RequirementListKey, id: string) => void;
  moveRequirement: (list: RequirementListKey, id: string, toIndex: number) => void;
  /** Seeds the NFR list once per design (attached only, not recorded); true only if items were added. */
  seedNonFunctional: (texts: readonly string[]) => boolean;
  /* Entities (T-13.4) */
  addEntity: (position: BoardPosition, name?: string) => string;
  renameEntity: (id: string, name: string) => void;
  /** A box drag: autosaved, never recorded. */
  moveEntity: (id: string, position: BoardPosition) => void;
  /** Removes the entity and every relation touching it. */
  removeEntity: (id: string) => void;
  addField: (
    entityId: string,
    afterFieldId?: string | null,
    init?: Partial<Pick<EntityField, "name" | "type">>,
  ) => string | null;
  updateField: (
    entityId: string,
    fieldId: string,
    patch: Partial<Pick<EntityField, "name" | "type">>,
  ) => void;
  removeField: (entityId: string, fieldId: string) => void;
  moveField: (entityId: string, fieldId: string, toIndex: number) => void;
  /** null when either end isn't an entity, or the pair is already related (either direction). Self-relations allowed. */
  addRelation: (from: string, to: string, kind?: RelationKind) => string | null;
  setRelationKind: (id: string, kind: RelationKind) => void;
  /** No-op when the relation or entity is unknown, nothing changes, or the new pair duplicates another relation. */
  repointRelation: (id: string, end: "from" | "to", entityId: string) => void;
  removeRelation: (id: string) => void;
  /* API (T-13.5) */
  addEndpoint: (at?: "start" | "end", init?: Partial<Omit<ApiEndpoint, "id">>) => string;
  /** undefined values in the patch are ignored. */
  updateEndpoint: (id: string, patch: Partial<Omit<ApiEndpoint, "id">>) => void;
  removeEndpoint: (id: string) => void;
  moveEndpoint: (id: string, toIndex: number) => void;
}

/** afterId null/undefined/unknown → append. */
function insertAfter<T extends { id: string }>(
  list: readonly T[],
  item: T,
  afterId?: string | null,
): T[] {
  const index = afterId == null ? -1 : list.findIndex((x) => x.id === afterId);
  if (index === -1) return [...list, item];
  return [...list.slice(0, index + 1), item, ...list.slice(index + 1)];
}

/** to = clamp(trunc(toIndex), 0, len-1); null if id unknown or to === from. */
function moveById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  toIndex: number,
): T[] | null {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1) return null;
  const truncated = Number.isFinite(toIndex) ? Math.trunc(toIndex) : toIndex > 0 ? list.length - 1 : 0;
  const to = Math.min(Math.max(truncated, 0), list.length - 1);
  if (to === from) return null;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Applies only keys !== "id" whose value is defined and differs; null if none or id unknown. Keeps key order. */
function patchById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  patch: Partial<T>,
): T[] | null {
  const index = list.findIndex((x) => x.id === id);
  if (index === -1) return null;
  const cur = list[index];
  const changed = (Object.keys(patch) as (keyof T)[]).filter(
    (k) => k !== "id" && patch[k] !== undefined && patch[k] !== cur[k],
  );
  if (changed.length === 0) return null;
  const merged = { ...cur };
  for (const k of changed) merged[k] = patch[k] as T[keyof T];
  const next = [...list];
  next[index] = merged;
  return next;
}

/** null if id unknown. */
function removeById<T extends { id: string }>(list: readonly T[], id: string): T[] | null {
  if (!list.some((x) => x.id === id)) return null;
  return list.filter((x) => x.id !== id);
}

function samePair(r: EntityRelation, a: string, b: string): boolean {
  return (r.from === a && r.to === b) || (r.from === b && r.to === a);
}

export function createBoardActions(
  getBoards: () => DesignBoards,
  setBoards: (boards: DesignBoards) => void,
  onEdit: (board: BoardPhase) => void,
  isAttached: () => boolean,
): BoardActions {
  const commit = <K extends BoardPhase>(key: K, next: DesignBoards[K], record = true) => {
    setBoards({ ...getBoards(), [key]: next });
    if (record) onEdit(key);
  };
  const uuid = () => crypto.randomUUID();

  const setRequirementList = (list: RequirementListKey, items: RequirementItem[] | null) => {
    if (items === null) return;
    commit("requirements", { ...getBoards().requirements, [list]: items });
  };
  const setEntities = (entities: EntityBox[] | null, record = true) => {
    if (entities === null) return;
    commit("entities", { ...getBoards().entities, entities }, record);
  };
  const setRelations = (relations: EntityRelation[] | null) => {
    if (relations === null) return;
    commit("entities", { ...getBoards().entities, relations });
  };
  const setEndpoints = (endpoints: ApiEndpoint[] | null) => {
    if (endpoints === null) return;
    commit("api", { endpoints });
  };
  /** Applies a list helper to one entity's fields; no-op if the entity is unknown or the helper returns null. */
  const withFields = (entityId: string, apply: (fields: EntityField[]) => EntityField[] | null) => {
    const { entities } = getBoards().entities;
    const entity = entities.find((e) => e.id === entityId);
    if (!entity) return;
    const fields = apply(entity.fields);
    if (fields === null) return;
    setEntities(entities.map((e) => (e.id === entityId ? { ...e, fields } : e)));
  };

  return {
    addRequirement: (list, afterId, text = "") => {
      const id = uuid();
      const item: RequirementItem = { id, text };
      setRequirementList(list, insertAfter(getBoards().requirements[list], item, afterId));
      return id;
    },
    updateRequirement: (list, id, text) =>
      setRequirementList(list, patchById(getBoards().requirements[list], id, { text })),
    removeRequirement: (list, id) =>
      setRequirementList(list, removeById(getBoards().requirements[list], id)),
    moveRequirement: (list, id, toIndex) =>
      setRequirementList(list, moveById(getBoards().requirements[list], id, toIndex)),
    seedNonFunctional: (texts) => {
      const requirements = getBoards().requirements;
      if (!isAttached() || requirements.nonFunctionalSeeded) return false;
      const add = requirements.nonFunctional.length === 0 && texts.length > 0;
      const nonFunctional: RequirementItem[] = add
        ? texts.map((text) => ({ id: uuid(), text, source: "scenario" }))
        : requirements.nonFunctional;
      commit("requirements", { ...requirements, nonFunctional, nonFunctionalSeeded: true }, false);
      return add;
    },

    addEntity: (position, name = "") => {
      const id = uuid();
      const entity: EntityBox = { id, name, fields: [], position: { x: position.x, y: position.y } };
      setEntities([...getBoards().entities.entities, entity]);
      return id;
    },
    renameEntity: (id, name) => setEntities(patchById(getBoards().entities.entities, id, { name })),
    moveEntity: (id, position) => {
      const { entities } = getBoards().entities;
      const entity = entities.find((e) => e.id === id);
      if (!entity || (entity.position.x === position.x && entity.position.y === position.y)) return;
      setEntities(
        entities.map((e) => (e.id === id ? { ...e, position: { x: position.x, y: position.y } } : e)),
        false,
      );
    },
    removeEntity: (id) => {
      const board = getBoards().entities;
      const entities = removeById(board.entities, id);
      if (entities === null) return;
      commit("entities", {
        entities,
        relations: board.relations.filter((r) => r.from !== id && r.to !== id),
      });
    },
    addField: (entityId, afterFieldId, init) => {
      if (!getBoards().entities.entities.some((e) => e.id === entityId)) return null;
      const id = uuid();
      const field: EntityField = { id, name: init?.name ?? "", type: init?.type ?? "" };
      withFields(entityId, (fields) => insertAfter(fields, field, afterFieldId));
      return id;
    },
    updateField: (entityId, fieldId, patch) =>
      withFields(entityId, (fields) => patchById<EntityField>(fields, fieldId, patch)),
    removeField: (entityId, fieldId) => withFields(entityId, (fields) => removeById(fields, fieldId)),
    moveField: (entityId, fieldId, toIndex) =>
      withFields(entityId, (fields) => moveById(fields, fieldId, toIndex)),
    addRelation: (from, to, kind = DEFAULT_RELATION_KIND) => {
      const { entities, relations } = getBoards().entities;
      const ids = new Set(entities.map((e) => e.id));
      if (!ids.has(from) || !ids.has(to)) return null;
      if (relations.some((r) => samePair(r, from, to))) return null;
      const id = uuid();
      setRelations([...relations, { id, from, to, kind }]);
      return id;
    },
    setRelationKind: (id, kind) => setRelations(patchById(getBoards().entities.relations, id, { kind })),
    repointRelation: (id, end, entityId) => {
      const { entities, relations } = getBoards().entities;
      const relation = relations.find((r) => r.id === id);
      if (!relation || !entities.some((e) => e.id === entityId)) return;
      if (relation[end] === entityId) return;
      const from = end === "from" ? entityId : relation.from;
      const to = end === "to" ? entityId : relation.to;
      if (relations.some((r) => r.id !== id && samePair(r, from, to))) return;
      setRelations(patchById(relations, id, { [end]: entityId }));
    },
    removeRelation: (id) => setRelations(removeById(getBoards().entities.relations, id)),

    addEndpoint: (at = "end", init) => {
      const id = uuid();
      const endpoint: ApiEndpoint = {
        id,
        method: init?.method ?? "GET",
        url: init?.url ?? "",
        status: init?.status ?? DEFAULT_ENDPOINT_STATUS,
        requestBody: init?.requestBody ?? "",
        responseBody: init?.responseBody ?? "",
      };
      const { endpoints } = getBoards().api;
      setEndpoints(at === "start" ? [endpoint, ...endpoints] : [...endpoints, endpoint]);
      return id;
    },
    updateEndpoint: (id, patch) => setEndpoints(patchById<ApiEndpoint>(getBoards().api.endpoints, id, patch)),
    removeEndpoint: (id) => setEndpoints(removeById(getBoards().api.endpoints, id)),
    moveEndpoint: (id, toIndex) => setEndpoints(moveById(getBoards().api.endpoints, id, toIndex)),
  };
}
