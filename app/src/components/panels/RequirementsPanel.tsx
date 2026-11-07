"use client";

import { useScenarioStore } from "@/stores/scenario-store";
import { FIELD_LABEL, INPUT } from "./styles";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";

export function RequirementsPanel() {
  const scenario = useScenarioStore((s) => s.scenario);
  const setBaseRps = useScenarioStore((s) => s.setBaseRps);
  const updatePass = useScenarioStore((s) => s.updatePass);
  const setStrongConsistency = useScenarioStore((s) => s.setStrongConsistency);
  const setMaxLagSec = useScenarioStore((s) => s.setMaxLagSec);

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
        <OptionalNumberField
          label="Max consumer lag (s)"
          value={scenario.pass.maxLagSec}
          min={0}
          step={1}
          placeholder="no limit"
          onChange={setMaxLagSec}
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

/** NumberField whose empty state means "unset" (onChange(null)). */
function OptionalNumberField({
  label,
  value,
  min,
  max,
  step,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  step?: number;
  placeholder: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          if (event.target.value === "") {
            onChange(null);
            return;
          }
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
