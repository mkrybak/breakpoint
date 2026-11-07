"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
import {
  Ellipsis,
  Repeat,
  ShieldAlert,
  ShieldOff,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { edgeDashDuration, edgeWidth } from "@/components/canvas/sim-visuals";
import { isSplitSource } from "@/lib/registry";
import { useDesignStore } from "@/stores/design-store";
import { useSimStore } from "@/stores/sim-store";
import type { ComponentFlowEdge } from "@/stores/flow-adapter";
import {
  edgeChipSegments,
  retryAmplification,
  type ChipTone,
} from "./edge-chip";
import {
  chipFits,
  collapsedChip,
  edgeSpan,
  placePopover,
  POPOVER_SIZE,
  type CollapsedIcon,
  type FlowRect,
} from "./edge-layout";

/** Upper bound on the call-edge editor (T-8.3); the engine itself is unbounded. */
const MAX_CALLS_PER_REQUEST = 100;

const TONE_CLASS: Record<ChipTone, string | undefined> = {
  muted: undefined,
  amber: "text-amber-400",
  rose: "text-rose-400",
};

const COLLAPSED_ICON: Record<CollapsedIcon, LucideIcon> = {
  "shield-off": ShieldOff,
  "shield-alert": ShieldAlert,
  repeat: Repeat,
  timer: Timer,
  ellipsis: Ellipsis,
};

/** Endpoint node box in flow coordinates; null until React Flow has measured it. */
function nodeRect(node: InternalNode | undefined): FlowRect | null {
  const width = node?.measured.width;
  const height = node?.measured.height;
  if (!node || !width || !height) return null;
  const { x, y } = node.internals.positionAbsolute;
  return { x, y, width, height };
}

export function FlowEdge({
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
  markerEnd,
  data,
}: EdgeProps<ComponentFlowEdge>) {
  const updateEdge = useDesignStore((s) => s.updateEdge);
  // T-12.3: one subscription; latestFrame is the scrubbed frame during replay
  const edgeFrame = useSimStore((s) => s.latestFrame?.perEdge[id]);
  const rps = edgeFrame?.rps ?? 0;
  const breakerPhase = edgeFrame?.breaker;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const isSplit = isSplitSource(data?.sourceKind);
  const share = data?.trafficShare ?? 1;
  const calls = data?.callsPerRequest ?? 1;
  const kind = data?.kind ?? "sync";
  const isAuto = isSplit && data?.autoShare !== false;
  const segments = edgeChipSegments(data, edgeFrame);
  // T-12.4: short edges. Collapse the chip and move the editor off the nodes.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const chipText = segments.map((s) => s.text).join(" · ");
  const collapsed = !chipFits(
    chipText,
    edgeSpan({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }),
  );
  const icon = collapsedChip(segments, retryAmplification(edgeFrame));
  const endpoints = [nodeRect(sourceNode), nodeRect(targetNode)].filter(
    (r): r is FlowRect => r !== null,
  );
  const popover = placePopover(
    { x: labelX, y: labelY },
    isSplit ? POPOVER_SIZE.split : POPOVER_SIZE.call,
    endpoints,
  );
  const anchor = selected ? popover.center : { x: labelX, y: labelY };
  const CollapsedIconCmp = COLLAPSED_ICON[icon.icon];

  const live = rps > 0;
  const width = live ? edgeWidth(rps) : selected ? 2 : 1.5;
  // Quantize the animation period so it changes rarely (avoids restart jitter tick-to-tick).
  const dur = Math.round(edgeDashDuration(rps) * 10) / 10;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected
            ? "#38bdf8"
            : breakerPhase === "open"
              ? "#fb7185"
              : live
                ? "#737373"
                : "#525252",
          strokeWidth: width,
          strokeDasharray: live ? "8 6" : kind === "async" ? "6 3" : undefined,
          animation: live ? `sim-flow ${dur}s linear infinite` : undefined,
          transition: "stroke-width 120ms linear",
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="absolute"
          data-edge-chip={selected ? "editor" : collapsed ? "icon" : "full"}
          style={{
            transform: `translate(-50%, -50%) translate(${anchor.x}px, ${anchor.y}px)`,
            // the open editor sits above nodes (React Flow paints nodes after
            // labels); when displaced (T-12.4) it sits below both endpoints
            zIndex: selected ? 1001 : undefined,
          }}
        >
          {selected ? (
            <div className="nodrag nopan pointer-events-auto flex items-center gap-1.5 rounded-lg border border-sky-400 bg-neutral-900 px-2 py-1 shadow-md">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                {isSplit ? "Share" : "Calls/req"}
              </span>
              {isSplit ? (
                <>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={share}
                    onChange={(event) => {
                      const next = event.target.valueAsNumber;
                      if (Number.isNaN(next)) return;
                      const trafficShare = Math.min(Math.max(next, 0), 1);
                      updateEdge(id, { autoShare: false, trafficShare });
                    }}
                    aria-label="Traffic share"
                    className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
                  />
                  <label className="flex items-center gap-1 text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={isAuto}
                      onChange={(event) =>
                        updateEdge(
                          id,
                          event.target.checked
                            ? { autoShare: true }
                            : { autoShare: false, trafficShare: share },
                        )
                      }
                      aria-label="Auto share"
                      className="accent-sky-500"
                    />
                    auto
                  </label>
                </>
              ) : (
                <input
                  type="number"
                  min={0}
                  max={MAX_CALLS_PER_REQUEST}
                  step={0.1}
                  value={calls}
                  onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isNaN(next)) return;
                    const callsPerRequest = Math.min(
                      Math.max(next, 0),
                      MAX_CALLS_PER_REQUEST,
                    );
                    updateEdge(id, { callsPerRequest });
                  }}
                  aria-label="Calls per request"
                  className="w-14 rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
                />
              )}
              <select
                value={kind}
                onChange={(event) =>
                  updateEdge(id, {
                    kind: event.target.value as "sync" | "async",
                  })
                }
                aria-label="Edge kind"
                className="rounded border border-neutral-700 bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100"
              >
                <option value="sync">sync</option>
                <option value="async">async</option>
              </select>
            </div>
          ) : collapsed ? (
            <span
              className={`flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded-full border border-neutral-700 bg-neutral-900 px-1 font-mono text-[10px] ${TONE_CLASS[icon.tone] ?? "text-neutral-400"}`}
            >
              <CollapsedIconCmp className="h-2.5 w-2.5" aria-hidden />
              {icon.text}
              <span className="sr-only">{chipText}</span>
            </span>
          ) : (
            <span className="rounded bg-neutral-900/90 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
              {segments.map((seg, i) => (
                <span key={seg.key} className={TONE_CLASS[seg.tone]}>
                  {i > 0 ? " · " : ""}
                  {seg.text}
                </span>
              ))}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
