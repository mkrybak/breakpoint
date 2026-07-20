import type { ComponentKind } from "./component";

export interface DesignNode {
  id: string;
  kind: ComponentKind;
  /** candidate's name for it */
  label: string;
  position: { x: number; y: number };
  config: Record<string, number | string | boolean>;
}

export interface DesignEdge {
  id: string;
  source: string;
  target: string;
  /** 0–1, fraction of source's outbound traffic on this edge */
  trafficShare: number;
  /**
   * Only meaningful when the source node is an `lb`. When true (the default
   * when absent), trafficShare is managed automatically: the edge takes an even
   * slice of the share left after the LB's manually-overridden edges.
   * Set to false when the user overrides the share by hand. (T-6.1)
   */
  autoShare?: boolean;
  /** async = via queue semantics, no latency on client path */
  kind: "sync" | "async";
}

export interface DesignGraph {
  nodes: DesignNode[];
  edges: DesignEdge[];
  entryNodeId: string;
}
