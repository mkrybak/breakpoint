import type { DesignGraph } from "@/lib/core";

/** Default name for a design created from the Quick card (no naming step). */
export const QUICK_DESIGN_NAME = "Quick simulation";

/**
 * Quick mode's starter: Client → App server → SQL database, configured with
 * the registry defaults a palette drop would give. Sized so it passes
 * STARTER_SCENARIO comfortably (app server at ~37% util).
 */
const STARTER_GRAPH: DesignGraph = {
  entryNodeId: "client",
  nodes: [
    {
      id: "client",
      kind: "client",
      label: "Client",
      position: { x: 0, y: 0 },
      config: {},
    },
    {
      id: "app",
      kind: "app_server",
      label: "App server",
      position: { x: 280, y: 0 },
      config: { replicas: 1 },
    },
    {
      id: "db",
      kind: "db_sql",
      label: "SQL database",
      position: { x: 560, y: 0 },
      config: { replicas: 0, sharded: false, readYourWrites: false },
    },
  ],
  edges: [
    {
      id: "e-client-app",
      source: "client",
      target: "app",
      callsPerRequest: 1,
      kind: "sync",
    },
    {
      id: "e-app-db",
      source: "app",
      target: "db",
      callsPerRequest: 1,
      kind: "sync",
    },
  ],
};

/** A fresh deep copy each call, so a new design never shares objects with the constant. */
export function starterGraph(): DesignGraph {
  return structuredClone(STARTER_GRAPH);
}
