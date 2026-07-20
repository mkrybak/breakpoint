import { listScenarioPresets, describeStressRule } from "@/lib/scenarios";

const CARD = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4";

export function ScenarioCards() {
  const scenarios = listScenarioPresets();
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Built-in stress tests
      </h2>
      <p className="mb-3 text-xs text-neutral-500">
        Every design is graded by surviving one of these. Pick a scenario inside
        the workspace.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {scenarios.map((s) => (
          <li key={s.id} className={CARD}>
            <h3 className="text-sm font-semibold text-neutral-100">{s.name}</h3>
            <p className="mt-1 text-xs text-neutral-400">{s.description}</p>
            <p className="mt-2 text-xs text-neutral-500">
              {s.baseRps.toLocaleString("en-US")} RPS base · {s.durationSec}s ·{" "}
              {Math.round(s.readRatio * 100)}% reads
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Target: p95 ≤ {s.pass.p95Ms}ms · errors ≤{" "}
              {Math.round(s.pass.maxErrorRate * 100)}%
              {s.pass.consistency === "strong" ? " · strong consistency" : ""}
            </p>
            {s.timeline.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {s.timeline.map((rule, i) => (
                  <li key={i} className="text-xs text-neutral-600">
                    {describeStressRule(rule)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
