import type { DesignGraph } from "@/lib/core";

export type WarningCode =
  | "outbound-shares"
  | "orphan-node"
  | "no-entry-client"
  | "sync-cycle";

/** One inline warning; ids let the shell highlight the offending elements. */
export interface ValidationWarning {
  code: WarningCode;
  message: string;
  nodeIds: string[];
  edgeIds: string[];
}

export type Check = (graph: DesignGraph) => ValidationWarning[];
