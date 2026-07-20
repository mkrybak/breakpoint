"use client";

import { useScenarioStore } from "@/stores/scenario-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const FIELD_LABEL =
  "text-[10px] font-medium tracking-wider text-neutral-500 uppercase";
const INPUT =
  "mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100";

export function RequirementsPanel() {
  const scenario = useScenarioStore((s) => s.scenario);
  const setBaseRps = useScenarioStore((s) => s.setBaseRps);
  const updatePass = useScenarioStore((s) => s.updatePass);
  const setStrongConsistency = useScenarioStore((s) => s.setStrongConsistency);

  return (
    <section>
      <h2 className={HEADING}>Requirements</h2>
      <div className="mt-2 space-y-3">
        <NumberField
          label="Base RPS"
          value={scenario.baseRps}
          min={0}
          step={500}
          onChange={setBaseRps}
        />
        <NumberField
          label="p95 budget (ms)"
          value={scenario.pass.p95Ms}
          min={1}
          step={10}
          onChange={(value) => updatePass({ p95Ms: value })}
        />
        <NumberField
          label="Max error rate (0–1)"
          value={scenario.pass.maxErrorRate}
          min={0}
          max={1}
          step={0.005}
          onChange={(value) => updatePass({ maxErrorRate: value })}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={scenario.pass.consistency === "strong"}
            onChange={(event) => setStrongConsistency(event.target.checked)}
          />
          <span className="text-xs text-neutral-300">
            Require strong consistency
          </span>
        </label>
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isNaN(next)) return;
          let clamped = next;
          if (min !== undefined) clamped = Math.max(clamped, min);
          if (max !== undefined) clamped = Math.min(clamped, max);
          onChange(clamped);
        }}
        className={INPUT}
      />
    </label>
  );
}
