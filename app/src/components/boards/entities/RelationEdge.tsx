"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import { DEFAULT_RELATION_KIND } from "@/persistence/boards";
import { useEntityBoardUi } from "./board-ui";
import { endGlyphPath, relationEnds, selfLoopPath, type RelationFlowEdge } from "./entity-flow";
import { RelationKindPicker } from "./RelationKindPicker";

/** A relation line with crow's-foot ends and no text; the kind picker floats at its middle when open. */
export function RelationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<RelationFlowEdge>) {
  const ui = useEntityBoardUi();
  const sourceNode = useInternalNode(source);
  const kind = data?.kind ?? DEFAULT_RELATION_KIND;
  const ends = relationEnds(kind);

  let path: string;
  let labelX: number;
  let labelY: number;
  if (source === target) {
    [path, labelX, labelY] = selfLoopPath({
      sx: sourceX,
      sy: sourceY,
      tx: targetX,
      ty: targetY,
      top: sourceNode?.internals.positionAbsolute.y ?? Math.min(sourceY, targetY) - 40,
    });
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }
  const stroke = selected ? "#38bdf8" : "#737373";

  return (
    <g data-relation-kind={kind}>
      <BaseEdge id={id} path={path} style={{ stroke, strokeWidth: selected ? 2 : 1.5 }} />
      <path
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        d={endGlyphPath(ends.from, sourceX, sourceY, 1)}
      />
      <path
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        d={endGlyphPath(ends.to, targetX, targetY, -1)}
      />
      {!ui.readOnly && ui.pickerFor === id && (
        <EdgeLabelRenderer>
          {/* React events bubble through the portal: without the stop, a picker click
              reaches the edge wrapper's onClick and reopens the picker */}
          <div
            className="nodrag nopan pointer-events-auto absolute"
            onClick={(e) => e.stopPropagation()}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: 1001,
            }}
          >
            <RelationKindPicker relationId={id} kind={kind} onDone={ui.closePicker} />
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
