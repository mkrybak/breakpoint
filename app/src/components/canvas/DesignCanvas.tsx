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
import { useCallback, useMemo, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import { PALETTE_DND_TYPE } from "@/components/palette/Palette";
import type { ComponentKind } from "@/lib/core";
import { COMPONENT_KINDS } from "@/lib/registry";
import { validateGraph } from "@/lib/validation";
import { importDesignFile } from "@/stores/design-file-store";
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

/** an OS file drag (design file import, T-12.8), not a palette drag */
const hasFiles = (e: DragEvent<HTMLDivElement>) =>
  e.dataTransfer.types.includes("Files");

function CanvasInner({
  designId,
  lockable,
}: {
  designId: string;
  lockable: boolean;
}) {
  const graph = useDesignStore((s) => s.graph);
  const selectedNodeIds = useDesignStore((s) => s.selectedNodeIds);
  const selectedEdgeIds = useDesignStore((s) => s.selectedEdgeIds);
  const measured = useDesignStore((s) => s.measured);
  const onNodesChange = useDesignStore((s) => s.onNodesChange);
  const onEdgesChange = useDesignStore((s) => s.onEdgesChange);
  const onConnect = useDesignStore((s) => s.onConnect);
  const addNode = useDesignStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const phaseLocked = usePhaseStore((s) => isCanvasLocked(s.phase));
  const locked = lockable && phaseLocked;

  const { nodes, edges } = useMemo(
    () => toFlow(graph, selectedNodeIds, measured, selectedEdgeIds),
    [graph, selectedNodeIds, measured, selectedEdgeIds],
  );

  const warnings = useMemo(() => validateGraph(graph), [graph]);
  const [fileOver, setFileOver] = useState(false);

  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (hasFiles(event)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setFileOver(true);
        return;
      }
      if (locked) return;
      if (!event.dataTransfer.types.includes(PALETTE_DND_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    [locked],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      // a dropped design file imports even while the canvas is locked, like the old Import button
      const file = event.dataTransfer.files[0];
      if (file) {
        event.preventDefault();
        setFileOver(false);
        void importDesignFile(file);
        return;
      }
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

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setFileOver(false);
  }, []);

  return (
    <div className="relative h-full" aria-label={`Design ${designId}`}>
      <ReactFlow<ComponentFlowNode, ComponentFlowEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={locked ? undefined : onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragLeave={onDragLeave}
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
      {fileOver && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-sky-500 bg-sky-500/10">
          <span className="flex items-center gap-2 rounded-lg bg-neutral-900/90 px-3 py-2 text-sm font-medium text-sky-200">
            <FileUp className="h-4 w-4" /> Drop to replace this design with
            the file
          </span>
        </div>
      )}
    </div>
  );
}

export function DesignCanvas({
  designId,
  lockable = true,
}: {
  designId: string;
  /** false in Quick mode: no phases, so never locked (T-7.5) */
  lockable?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner designId={designId} lockable={lockable} />
    </ReactFlowProvider>
  );
}
