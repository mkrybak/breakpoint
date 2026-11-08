import type { Phase } from "./action";

/** Practice steps that have a board (M13); also the keys of DesignBoards. */
export type BoardPhase = Extract<Phase, "requirements" | "entities" | "api">;
export interface BoardPosition {
  x: number;
  y: number;
}

export interface RequirementItem {
  id: string;
  text: string;
  /** "scenario" = seeded from the scenario NFRs; absent = typed by the user. */
  source?: "scenario";
}
export type RequirementListKey = "functional" | "nonFunctional";
export interface RequirementsBoard {
  functional: RequirementItem[];
  nonFunctional: RequirementItem[];
  /** Set once seeding ran for this design (even if it added nothing); seeding never re-runs. */
  nonFunctionalSeeded: boolean;
}

export interface EntityField {
  id: string;
  name: string;
  type: string;
}
export interface EntityBox {
  id: string;
  name: string;
  fields: EntityField[];
  position: BoardPosition;
}
/** Cardinality read from → to: "one-to-many" = one `from`, many `to` (crow's foot at `to`). */
export type RelationKind =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one"
  | "many-to-many";
export interface EntityRelation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
}
export interface EntitiesBoard {
  entities: EntityBox[];
  relations: EntityRelation[];
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  url: string;
  /** HTTP status code as typed, e.g. "201" (raw text, never coerced). */
  status: string;
  /** Raw text as typed; may be invalid JSON. */
  requestBody: string;
  responseBody: string;
}
export interface ApiBoard {
  endpoints: ApiEndpoint[];
}

/**
 * Practice step boards (M13), persisted as DesignRecord.boards. The key order
 * of every interface in this file is the canonical serialisation order: the
 * persistence guard and the store factories build objects in it, so a
 * save → load round-trip is byte-identical.
 */
export interface DesignBoards {
  requirements: RequirementsBoard;
  entities: EntitiesBoard;
  api: ApiBoard;
}
