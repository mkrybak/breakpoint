"use client";

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, type DragEvent } from "react";
import { PALETTE_DND_TYPE } from "@/components/palette/Palette";
import type { ComponentKind } from "@/lib/core";
import { COMPONENT_KINDS } from "@/lib/registry";
import { useDesignStore } from "@/stores/design-store";
import {
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
} from "@/stores/flow-adapter";
import { ComponentNode } from "./nodes/ComponentNode";

const nodeTypes = { component: ComponentNode };

function isComponentKind(value: string): value is ComponentKind {
  return (COMPONENT_KINDS as string[]).includes(value);
}

function CanvasInner({ designId }: { designId: string }) {
  const graph = useDesignStore((s) => s.graph);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const measured = useDesignStore((s) => s.measured);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);
  const addNode = useDesignStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const { nodes, edges } = useMemo(
    () => toFlow(graph, selectedNodeIds, measured),
    [graph, selectedNodeIds, measured],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(PALETTE_DND_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const kind = event.dataTransfer.getData(PALETTE_DND_TYPE);
      if (!isComponentKind(kind)) return;
      event.preventDefault();
      addNode(
        kind,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div className="h-full" aria-label={`Design ${designId}`}>
      <ReactFlow<ComponentFlowNode, ComponentFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
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

export function DesignCanvas({ designId }: { designId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasInner designId={designId} />
    </ReactFlowProvider>
  );
}
