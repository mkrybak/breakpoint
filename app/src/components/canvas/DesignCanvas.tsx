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
import { isCanvasLocked, usePhaseStore } from "@/stores/phase-store";
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
  const locked = usePhaseStore((s) => isCanvasLocked(s.phase));

  const { nodes, edges } = useMemo(
    () => toFlow(graph, selectedNodeIds, measured, selectedEdgeIds),
    [graph, selectedNodeIds, measured, selectedEdgeIds],
  );

  const warnings = useMemo(() => validateGraph(graph), [graph]);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (locked) return;
      if (!event.dataTransfer.types.includes(PALETTE_DND_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [locked],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (locked) return;
      const kind = event.dataTransfer.getData(PALETTE_DND_TYPE);
      if (!isComponentKind(kind)) return;
      event.preventDefault();
      addNode(
        kind,
        screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    },
    [addNode, screenToFlowPosition, locked],
  );

  return (
    <div className="h-full" aria-label={`Design ${designId}`}>
      <ReactFlow<ComponentFlowNode, ComponentFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={locked ? undefined : onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        elementsSelectable={!locked}
        deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
        fitView
        colorMode="dark"
      >
        <Background />
        <Controls />
        {locked && (
          <Panel position="top-center">
            <div className="rounded-lg border border-amber-500/40 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-amber-300">
              🔒 Canvas unlocks in the High-level design phase
            </div>
          </Panel>
        )}
        {!locked && graph.nodes.length === 0 && (
          <Panel position="top-center">
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-neutral-400">
              Drag a component from the palette to start designing
            </div>
          </Panel>
        )}
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
