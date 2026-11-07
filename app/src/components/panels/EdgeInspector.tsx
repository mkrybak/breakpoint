"use client";

import { formatPct, formatRps } from "@/components/hud/hud-format";
import type { DesignEdge } from "@/lib/core";
import {
  edgeSupportsResilience,
  MAX_RETRIES,
  MAX_TIMEOUT_MS,
} from "@/lib/simulation";
import { useDesignStore } from "@/stores/design-store";
import { useSimStore } from "@/stores/sim-store";
import { FIELD_LABEL, INPUT } from "./styles";

/** Right-panel Edge section (T-8.5): per-edge timeout and retries. */
export function EdgeInspector({ edge }: { edge: DesignEdge }) {
  const nodes = useDesignStore((s) => s.graph.nodes);
  const updateEdge = useDesignStore((s) => s.updateEdge);
  const live = useSimStore((s) => s.latestFrame?.perEdge[edge.id]);
  const source = nodes.find((n) => n.id === edge.source);
  const target = nodes.find((n) => n.id === edge.target);

  return (
    <div className="mt-2 space-y-3">
      <p className="text-xs text-neutral-300">
        {source?.label ?? edge.source} → {target?.label ?? edge.target}
      </p>
      {!edgeSupportsResilience(edge, source?.kind) ? (
        <p className="text-xs text-neutral-500">
          {edge.kind === "async"
            ? "Async edges hand work to a queue. Timeouts and retries apply to sync calls only."
            : "Consumers pull from a queue at their own pace. Timeouts and retries don't apply."}
        </p>
      ) : (
        <div className="space-y-3">
          <h3 className={FIELD_LABEL}>Resilience</h3>
          <label className="block">
            <span className={FIELD_LABEL}>Timeout (ms)</span>
            <input
              type="number"
              min={1}
              max={MAX_TIMEOUT_MS}
              step={10}
              placeholder="none"
              value={edge.timeoutMs ?? ""}
              onChange={(event) => {
                if (event.target.value === "") {
                  updateEdge(edge.id, { timeoutMs: undefined });
                  return;
                }
                const n = event.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                updateEdge(edge.id, {
                  timeoutMs: Math.min(
                    Math.max(Math.round(n), 1),
                    MAX_TIMEOUT_MS,
                  ),
                });
              }}
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Retries</span>
            <input
              type="number"
              min={0}
              max={MAX_RETRIES}
              step={1}
              value={edge.retries ?? 0}
              onChange={(event) => {
                const n = event.target.valueAsNumber;
                if (Number.isNaN(n)) return;
                const r = Math.min(Math.max(Math.round(n), 0), MAX_RETRIES);
                updateEdge(edge.id, { retries: r === 0 ? undefined : r });
              }}
              className={INPUT}
            />
          </label>
          <p className="text-[11px] text-neutral-500">
            A call fails if the target sheds it or it takes longer than the
            timeout. Each retry re-sends it on the next tick.
          </p>
          {live?.failRate !== undefined && (
            <p className="text-xs text-neutral-400">
              Now: {formatPct(live.failRate)} of calls failing ·{" "}
              {formatRps(live.retryRps ?? 0)} RPS retried
            </p>
          )}
          {/* T-8.6: circuit breaker fields go here */}
        </div>
      )}
    </div>
  );
}
