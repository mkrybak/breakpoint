"use client";

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState } from "react";
import type { DesignGraph } from "@/lib/core";
import { FlowEdge } from "@/components/canvas/edges/FlowEdge";
import { ComponentNode } from "@/components/canvas/nodes/ComponentNode";
import {
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
  type NodeMeasurements,
} from "@/stores/flow-adapter";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { flow: FlowEdge };

function ReviewCanvasInner({ graph }: { graph: DesignGraph }) {
  const [measured, setMeasured] = useState<NodeMeasurements>({});

  const { nodes, edges } = useMemo(
    () => toFlow(graph, [], measured, []),
    [graph, measured],
  );

  // Read-only: the only change we act on is React Flow reporting node dimensions —
  // echo them back or the nodes stay visibility:hidden (02-data-model, T-1.2 fix).
  // Position / selection / removal changes are ignored.
  const onNodesChange = useCallback(
    (changes: NodeChange<ComponentFlowNode>[]) => {
      setMeasured((prev) => {
        let next = prev;
        for (const change of changes) {
          if (change.type === "dimensions" && change.dimensions) {
            if (next === prev) next = { ...prev };
            next[change.id] = {
              width: change.dimensions.width,
              height: change.dimensions.height,
            };
          }
        }
        return next;
      });
    },
    [],
  );

  return (
    <ReactFlow<ComponentFlowNode, ComponentFlowEdge>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      deleteKeyCode={null}
      fitView
      colorMode="dark"
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function ReviewCanvas({ graph }: { graph: DesignGraph }) {
  return (
    <ReactFlowProvider>
      <ReviewCanvasInner graph={graph} />
    </ReactFlowProvider>
  );
}
