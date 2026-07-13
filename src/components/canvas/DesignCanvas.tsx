"use client";

import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import { useDesignStore } from "@/stores/design-store";
import {
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
} from "@/stores/flow-adapter";
import { ComponentNode } from "./nodes/ComponentNode";

const nodeTypes = { component: ComponentNode };

export function DesignCanvas({ designId }: { designId: string }) {
  const graph = useDesignStore((s) => s.graph);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);

  const { nodes, edges } = useMemo(
    () => toFlow(graph, selectedNodeIds),
    [graph, selectedNodeIds],
  );

  return (
    <div style={{ height: "100dvh" }} aria-label={`Design ${designId}`}>
      <ReactFlow<ComponentFlowNode, ComponentFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        colorMode="dark"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
