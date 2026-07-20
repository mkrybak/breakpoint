"use client";

import { useEffect, useRef } from "react";
import {
  classifyLogSeverity,
  LOG_SEVERITY_COLOR,
} from "@/components/hud/hud-format";
import { useSimStore } from "@/stores/sim-store";

export function EventLog() {
  const log = useSimStore((s) => s.log);
  const scrollRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-neutral-800">
      <h2 className="shrink-0 px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Event log
      </h2>
      {log.length === 0 ? (
        <p className="px-3 text-xs text-neutral-600">No events yet.</p>
      ) : (
        <ol ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {log.map((entry, i) => (
            <li
              key={`${entry.t}-${i}`}
              className="flex gap-2 py-0.5 font-mono text-[11px] leading-tight"
            >
              <span className="shrink-0 text-neutral-600">
                {entry.t.toFixed(1)}s
              </span>
              <span
                className={LOG_SEVERITY_COLOR[classifyLogSeverity(entry.message)]}
              >
                {entry.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
