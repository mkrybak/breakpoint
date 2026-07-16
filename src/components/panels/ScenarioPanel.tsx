"use client";

import { describeStressRule, listScenarioPresets } from "@/lib/scenarios";
import { useScenarioStore } from "@/stores/scenario-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const FIELD_LABEL =
  "text-[10px] font-medium tracking-wider text-neutral-500 uppercase";
const INPUT =
  "mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100";

export function ScenarioPanel() {
  const scenario = useScenarioStore((s) => s.scenario);
  const selectPreset = useScenarioStore((s) => s.selectPreset);
  const presets = listScenarioPresets();

  return (
    <section>
      <h2 className={HEADING}>Scenario</h2>
      <label className="mt-2 block">
        <span className={FIELD_LABEL}>Preset</span>
        <select
          value={scenario.id}
          onChange={(event) => selectPreset(event.target.value)}
          className={INPUT}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-2 text-xs text-neutral-400">{scenario.description}</p>

      <dl className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-neutral-400">
        <div>
          <dt className="inline text-neutral-500">Duration </dt>
          <dd className="inline">{scenario.durationSec}s</dd>
        </div>
        <div>
          <dt className="inline text-neutral-500">Base </dt>
          <dd className="inline">{scenario.baseRps} RPS</dd>
        </div>
        <div>
          <dt className="inline text-neutral-500">Read ratio </dt>
          <dd className="inline">{scenario.readRatio}</dd>
        </div>
        <div>
          <dt className="inline text-neutral-500">Seed </dt>
          <dd className="inline">{scenario.seed}</dd>
        </div>
      </dl>

      <h3 className="mt-3 text-[10px] font-medium tracking-wider text-neutral-500 uppercase">
        Timeline
      </h3>
      {scenario.timeline.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">No stress rules.</p>
      ) : (
        <ol className="mt-1 space-y-1">
          {scenario.timeline.map((rule, index) => (
            <li
              key={`${rule.at}-${rule.rule}-${index}`}
              className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-300"
            >
              {describeStressRule(rule)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
