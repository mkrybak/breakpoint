import type { DesignGraph } from "@/lib/core";
import type { Check, ValidationWarning } from "./types";

/** Tolerance for float drift from 0.05-step share inputs. */
const SHARE_EPSILON = 0.001;

const checkOutboundShares: Check = (graph) => {
  const warnings: ValidationWarning[] = [];
  for (const node of graph.nodes) {
    const outbound = graph.edges.filter((e) => e.source === node.id);
    if (outbound.length === 0) continue;
    const sum = outbound.reduce((acc, e) => acc + e.trafficShare, 0);
    if (Math.abs(sum - 1) > SHARE_EPSILON) {
      warnings.push({
        code: "outbound-shares",
        message: `"${node.label}": outbound traffic shares sum to ${
          Math.round(sum * 100) / 100
        }, expected 1`,
        nodeIds: [node.id],
        edgeIds: outbound.map((e) => e.id),
      });
    }
  }
  return warnings;
};

const checkOrphanNodes: Check = (graph) => {
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }
  return graph.nodes
    .filter((node) => !connected.has(node.id))
    .map(
      (node): ValidationWarning => ({
        code: "orphan-node",
        message: `"${node.label}" is not connected to anything`,
        nodeIds: [node.id],
        edgeIds: [],
      }),
    );
};

const checkEntryClient: Check = (graph) => {
  if (graph.nodes.length === 0) return [];
  const entry = graph.nodes.find((node) => node.id === graph.entryNodeId);
  if (entry?.kind === "client") return [];
  return [
    {
      code: "no-entry-client",
      message:
        "No entry client — add a Client node to mark where traffic enters",
      nodeIds: [],
      edgeIds: [],
    },
  ];
};

/** Cycles = SCCs of the sync-edge subgraph (size > 1, or a self-loop). Tarjan. */
const checkSyncCycles: Check = (graph) => {
  const syncEdges = graph.edges.filter((e) => e.kind === "sync");
  const adjacency = new Map<string, string[]>(
    graph.nodes.map((n) => [n.id, []]),
  );
  for (const edge of syncEdges) adjacency.get(edge.source)?.push(edge.target);

  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let nextIndex = 0;

  function strongConnect(v: string): void {
    indices.set(v, nextIndex);
    lowlinks.set(v, nextIndex);
    nextIndex += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      scc.reverse();
      const isSelfLoop =
        scc.length === 1 && (adjacency.get(v) ?? []).includes(v);
      if (scc.length > 1 || isSelfLoop) cycles.push(scc);
    }
  }

  for (const node of graph.nodes) {
    if (!indices.has(node.id)) strongConnect(node.id);
  }

  return cycles.map((scc): ValidationWarning => {
    const inScc = new Set(scc);
    const labels = scc.map((id) => labelById.get(id) ?? id);
    return {
      code: "sync-cycle",
      message: `Sync cycle: ${[...labels, labels[0]].join(" → ")}`,
      nodeIds: scc,
      edgeIds: syncEdges
        .filter((e) => inScc.has(e.source) && inScc.has(e.target))
        .map((e) => e.id),
    };
  });
};

/** Extension point (05-engines): new warning = push a Check here. */
const CHECKS: Check[] = [
  checkOutboundShares,
  checkOrphanNodes,
  checkEntryClient,
  checkSyncCycles,
];

export function validateGraph(graph: DesignGraph): ValidationWarning[] {
  return CHECKS.flatMap((check) => check(graph));
}
