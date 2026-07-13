"use client";

import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, type DragEvent } from "react";
import { PALETTE_DND_TYPE } from "@/components/palette/Palette";
import type { ComponentKind } from "@/lib/core";
import { COMPONENT_KINDS } from "@/lib/registry";
import { validateGraph } from "@/lib/validation";
import { useDesignStore } from "@/stores/design-store";
import {
  toFlow,
  type ComponentFlowEdge,
  type ComponentFlowNode,
} from "@/stores/flow-adapter";
import { FlowEdge } from "./edges/FlowEdge";
import { ComponentNode } from "./nodes/ComponentNode";

const nodeTypes = { component: ComponentNode };
const edgeTypes = { flow: FlowEdge };

function isComponentKind(value: string): value is ComponentKind {
  return (COMPONENT_KINDS as string[]).includes(value);
}

function CanvasInner({ designId }: { designId: string }) {
  const graph = useDesignStore((s) => s.graph);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDesignStore((s) => s.selectedEdgeIds);
  const measured = useDesignStore((s) => s.measured);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);
  const onConnect = useDesignStore((s) => s.onConnect);
  const addNode = useDesignStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const { nodes, edges } = useMemo(
    () => toFlow(graph, selectedNodeIds, measured, selectedEdgeIds),
    [graph, selectedNodeIds, measured, selectedEdgeIds],
  );

  const warnings = useMemo(() => validateGraph(graph), [graph]);

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
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        colorMode="dark"
      >
        <Background />
        <Controls />
        {warnings.length > 0 && (
          <Panel position="bottom-left">
            <ul className="max-w-xs space-y-1 rounded-lg border border-amber-500/40 bg-neutral-900/90 p-2">
              {warnings.map((w) => (
                <li
                  key={`${w.code}:${w.nodeIds.join(",")}:${w.edgeIds.join(",")}`}
                  className="text-xs text-amber-300"
                >
                  ⚠ {w.message}
                </li>
              ))}
            </ul>
          </Panel>
        )}
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
