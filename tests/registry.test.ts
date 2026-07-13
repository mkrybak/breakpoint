import { describe, expect, it } from "vitest";
import {
  CATEGORY_ORDER,
  COMPONENT_DEFS,
  COMPONENT_KINDS,
  getComponentDef,
} from "../src/lib/registry/index";

describe("registry", () => {
  it("all 13 kinds present", () => {
    expect(COMPONENT_KINDS).toHaveLength(13);
    expect([...COMPONENT_KINDS].sort()).toEqual([
      "api_gateway",
      "app_server",
      "blob",
      "cache",
      "cdn",
      "client",
      "db_nosql",
      "db_sql",
      "lb",
      "queue",
      "search",
      "stream",
      "worker",
    ]);
  });

  it("record keys match entry kinds", () => {
    for (const [key, def] of Object.entries(COMPONENT_DEFS)) {
      expect(def.kind, key).toBe(key);
    }
  });

  it("every defined capacity number > 0", () => {
    for (const def of Object.values(COMPONENT_DEFS)) {
      for (const value of Object.values(def.capacity)) {
        expect(Number.isFinite(value), def.kind).toBe(true);
        expect(value as number, def.kind).toBeGreaterThan(0);
      }
    }
  });

  it("baseMs > 0", () => {
    for (const def of Object.values(COMPONENT_DEFS)) {
      expect(def.latency.baseMs, def.kind).toBeGreaterThan(0);
    }
  });

  it("configFields are well-formed", () => {
    for (const def of Object.values(COMPONENT_DEFS)) {
      const keys = def.configFields.map((f) => f.key);
      expect(new Set(keys).size, def.kind).toBe(keys.length);

      for (const field of def.configFields) {
        if (field.type === "number") {
          expect(field.min, `${def.kind}.${field.key}`).toBeLessThan(
            field.max,
          );
          expect(field.step, `${def.kind}.${field.key}`).toBeGreaterThan(0);
          expect(
            field.min <= field.default && field.default <= field.max,
            `${def.kind}.${field.key}`,
          ).toBe(true);
        }
        if (field.type === "select") {
          expect(
            field.options.includes(field.default),
            `${def.kind}.${field.key}`,
          ).toBe(true);
        }
      }
    }
  });

  it("getComponentDef", () => {
    expect(getComponentDef("db_sql")).toBe(COMPONENT_DEFS.db_sql);
    expect(getComponentDef("db_sql").capacity.writeRps).toBe(15000);
  });

  it("CATEGORY_ORDER covers all categories in use", () => {
    for (const def of Object.values(COMPONENT_DEFS)) {
      expect(CATEGORY_ORDER, def.kind).toContain(def.category);
    }
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
