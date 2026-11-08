"use client";

import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeMouseHandler,
  type IsValidConnection,
  type NodeChange,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import type { EntitiesBoard as EntitiesBoardData } from "@/lib/core";
import { useDesignStore } from "@/stores/design-store";
import type { NodeMeasurements } from "@/stores/flow-adapter";
import {
  EntityBoardUiContext,
  READ_ONLY_UI,
  entityNameKey,
  type EntityBoardUi,
  type FocusRequest,
} from "./board-ui";
import {
  ENTITY_WIDTH,
  FIELD_TYPE_SUGGESTIONS,
  NEW_ENTITY_HEIGHT,
  applySelection,
  entityRect,
  freeSpot,
  isDuplicatePair,
  reconnectOps,
  splitEdgeChanges,
  splitNodeChanges,
  toEntityFlow,
  toolbarHint,
  type EntityFlowNode,
  type FlowRect,
  type RelationFlowEdge,
} from "./entity-flow";
import { EntityNode } from "./EntityNode";
import { RelationEdge } from "./RelationEdge";

export type EntitiesBoardProps = { readOnly?: false } | { readOnly: true; board: EntitiesBoardData };

/** The Entities step board (M13, T-13.4): its own React Flow instance, separate from the simulation canvas. */
export function EntitiesBoard(props: EntitiesBoardProps) {
  return (
    <ReactFlowProvider>
      {props.readOnly ? <ReadOnlyEntities board={props.board} /> : <EditableEntities />}
    </ReactFlowProvider>
  );
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { relation: RelationEdge };
const FIT_VIEW = { maxZoom: 1, padding: 0.2 };
const NO_SELECTION: ReadonlySet<string> = new Set();

/** Renders only the passed board; never touches design-store (T-13.6 review). */
function ReadOnlyEntities({ board }: { board: EntitiesBoardData }) {
  const [measured, setMeasured] = useState<NodeMeasurements>({});
  const { nodes, edges } = useMemo(() => toEntityFlow(board, measured, NO_SELECTION), [board, measured]);

  // The only change acted on: echo dimensions back, or the nodes stay visibility:hidden.
  const onNodesChange = useCallback((changes: NodeChange<EntityFlowNode>[]) => {
    const { dimensions } = splitNodeChanges(changes);
    if (Object.keys(dimensions).length) setMeasured((p) => ({ ...p, ...dimensions }));
  }, []);

  return (
    <EntityBoardUiContext.Provider value={READ_ONLY_UI}>
      <div className="h-full w-full">
        <ReactFlow<EntityFlowNode, RelationFlowEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={FIT_VIEW}
          colorMode="dark"
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </EntityBoardUiContext.Provider>
  );
}

function EditableEntities() {
  const board = useDesignStore((s) => s.boards.entities);
  const addEntity = useDesignStore((s) => s.addEntity);
  const moveEntity = useDesignStore((s) => s.moveEntity);
  const removeEntity = useDesignStore((s) => s.removeEntity);
  const addRelation = useDesignStore((s) => s.addRelation);
  const repointRelation = useDesignStore((s) => s.repointRelation);
  const removeRelation = useDesignStore((s) => s.removeRelation);
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow();

  const [measured, setMeasured] = useState<NodeMeasurements>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusRequest | null>(null);
  // fitView only on a mount with boxes: on an empty board React Flow keeps the fit
  // queued and fires it when the first new box is measured, jumping the view.
  const [fitOnMount] = useState(() => board.entities.length > 0);
  const typeListId = useId();
  const flowRef = useRef<HTMLDivElement>(null);

  const { nodes, edges } = useMemo(
    () => toEntityFlow(board, measured, selected),
    [board, measured, selected],
  );

  const ui = useMemo<EntityBoardUi>(
    () => ({
      readOnly: false,
      fieldTypeListId: typeListId,
      pickerFor,
      closePicker: () => setPickerFor(null),
      focus,
      requestFocus: (key) => setFocus({ key }),
    }),
    [typeListId, pickerFor, focus],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<EntityFlowNode>[]) => {
      const ops = splitNodeChanges(changes);
      if (Object.keys(ops.dimensions).length) setMeasured((p) => ({ ...p, ...ops.dimensions }));
      ops.moves.forEach((m) => moveEntity(m.id, m.position));
      ops.removes.forEach(removeEntity);
      setSelected((p) => applySelection(p, ops.selection));
    },
    [moveEntity, removeEntity],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<RelationFlowEdge>[]) => {
      const ops = splitEdgeChanges(changes);
      ops.removes.forEach(removeRelation);
      setSelected((p) => applySelection(p, ops.selection));
      // keyboard path: React Flow selects a focused edge on Enter
      const picked = Object.keys(ops.selection).filter((k) => ops.selection[k]);
      if (picked.length === 1) setPickerFor(picked[0]);
      if (pickerFor !== null && ops.selection[pickerFor] === false) setPickerFor(null);
    },
    [removeRelation, pickerFor],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) addRelation(c.source, c.target); // default kind comes from the store
    },
    [addRelation],
  );

  const isValidConnection = useCallback<IsValidConnection<RelationFlowEdge>>(
    (c) => !isDuplicatePair(board.relations, c.source, c.target),
    [board.relations],
  );

  const onReconnect = useCallback<OnReconnect<RelationFlowEdge>>(
    (old, c) =>
      reconnectOps(old, c).forEach((op) => repointRelation(old.id, op.end, op.entityId)),
    [repointRelation],
  );

  const onEdgeClick = useCallback<EdgeMouseHandler<RelationFlowEdge>>(
    (_, edge) => setPickerFor(edge.id),
    [],
  );
  const onPaneClick = useCallback(() => setPickerFor(null), []);

  const onAddEntity = useCallback(() => {
    const r = flowRef.current?.getBoundingClientRect();
    let view: FlowRect = { x: 0, y: 0, width: 800, height: 600 };
    if (r) {
      const tl = screenToFlowPosition({ x: r.left, y: r.top });
      const br = screenToFlowPosition({ x: r.right, y: r.bottom });
      view = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    }
    const spot = freeSpot(
      board.entities.map((e) => entityRect(e, measured)),
      view,
    );
    const id = addEntity(spot.position);
    setFocus({ key: entityNameKey(id) });
    if (!spot.inView) {
      void setCenter(spot.position.x + ENTITY_WIDTH / 2, spot.position.y + NEW_ENTITY_HEIGHT / 2, {
        zoom: getZoom(),
        duration: 200,
      });
    }
  }, [board.entities, measured, addEntity, screenToFlowPosition, setCenter, getZoom]);

  return (
    <EntityBoardUiContext.Provider value={ui}>
      <div
        className="flex h-full w-full flex-col"
        onKeyDown={(e) => {
          if (e.key === "Escape") setPickerFor(null);
        }}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-3 py-2">
          <button
            type="button"
            aria-label="Add entity"
            onClick={onAddEntity}
            className="flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-medium text-neutral-200 transition-colors duration-150 hover:border-sky-500/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
          >
            <Plus className="h-3.5 w-3.5" /> Entity
          </button>
          <p className="truncate text-xs text-neutral-500">
            {toolbarHint(board.entities.length, board.relations.length)}
          </p>
        </div>
        <div ref={flowRef} className="relative min-h-0 flex-1">
          <ReactFlow<EntityFlowNode, RelationFlowEdge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onReconnect={onReconnect}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView={fitOnMount}
            fitViewOptions={FIT_VIEW}
            colorMode="dark"
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <datalist id={typeListId}>
          {FIELD_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
    </EntityBoardUiContext.Provider>
  );
}
