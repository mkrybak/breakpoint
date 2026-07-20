"use client";

import { describeRunStatus, type RunTone } from "@/components/hud/hud-format";
import { useSimStore } from "@/stores/sim-store";

const TONE: Record<RunTone, string> = {
  idle: "border-neutral-700 bg-neutral-900/90 text-neutral-300",
  running: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  pass: "border-green-500/50 bg-green-500/10 text-green-200",
  fail: "border-red-500/50 bg-red-500/10 text-red-200",
};

export function Verdict() {
  const status = useSimStore((s) => s.status);
  const result = useSimStore((s) => s.result);

  if (status === "idle") return null;

  const { label, tone } = describeRunStatus(status, result);
  const verdict = result?.verdict ?? null;

  return (
    <div
      className={`pointer-events-auto max-w-md rounded-xl border px-4 py-2 shadow-lg backdrop-blur ${TONE[tone]}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full bg-current ${
            tone === "running" ? "animate-pulse" : ""
          }`}
        />
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {verdict && verdict.failures.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {verdict.failures.map((f, i) => (
            <li key={`${f.criterion}-${i}`} className="text-xs">
              <span className="font-mono text-red-300">{f.criterion}</span>{" "}
              <span className="text-neutral-400">@ {f.atSec}s</span> — {f.detail}
            </li>
          ))}
        </ul>
      )}
      {verdict && verdict.passed && verdict.advisories.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {verdict.advisories.map((a) => (
            <li key={a} className="text-xs text-amber-300/90">
              ⚠ {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
