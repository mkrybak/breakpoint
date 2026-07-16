"use client";

import { Skull, Waves, Zap, type LucideIcon } from "lucide-react";
import { describeStressRule, listScenarioPresets } from "@/lib/scenarios";
import type { StressRule } from "@/lib/core";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

const HEADING =
  "text-xs font-semibold tracking-wide text-neutral-400 uppercase";
const FIELD_LABEL =
  "text-[10px] font-medium tracking-wider text-neutral-500 uppercase";
const INPUT =
  "mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100";

const CHAOS_ACTIONS: { label: string; icon: LucideIcon; rule: StressRule }[] = [
  {
    label: "Kill server",
    icon: Skull,
    rule: { at: 0, rule: "kill", target: "app_server", count: 1 },
  },
  { label: "Flush cache", icon: Waves, rule: { at: 0, rule: "flush", target: "cache" } },
  { label: "Spike ×3", icon: Zap, rule: { at: 0, rule: "spike", factor: 3, forSec: 5 } },
];

export function ScenarioPanel() {
  const scenario = useScenarioStore((s) => s.scenario);
  const selectPreset = useScenarioStore((s) => s.selectPreset);
  const presets = listScenarioPresets();
  const status = useSimStore((s) => s.status);
  const chaos = useSimStore((s) => s.chaos);
  const chaosEnabled = status === "running" || status === "paused";

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

      <h3 className="mt-4 text-[10px] font-medium tracking-wider text-neutral-500 uppercase">
        Live chaos
      </h3>
      <div className="mt-1 flex flex-col gap-1">
        {CHAOS_ACTIONS.map(({ label, icon: Icon, rule }) => (
          <button
            key={label}
            onClick={() => chaos(rule)}
            disabled={!chaosEnabled}
            title={chaosEnabled ? undefined : "Run the simulation to inject chaos"}
            className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
    </section>
  );
}
