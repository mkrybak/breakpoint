import type { Scenario, StressRule } from "@/lib/core";
import azOutage from "./presets/az-outage.json";
import blackFriday from "./presets/black-friday.json";
import celebrityTweet from "./presets/celebrity-tweet.json";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function str(v: unknown): v is string {
  return typeof v === "string";
}

function parseRule(v: unknown): StressRule | null {
  if (!isRecord(v) || !num(v.at) || !str(v.rule)) return null;
  switch (v.rule) {
    case "ramp":
      return num(v.toRps) && num(v.overSec)
        ? { at: v.at, rule: "ramp", toRps: v.toRps, overSec: v.overSec }
        : null;
    case "spike":
      return num(v.factor) && num(v.forSec)
        ? { at: v.at, rule: "spike", factor: v.factor, forSec: v.forSec }
        : null;
    case "kill": {
      if (!str(v.target)) return null;
      const kill: Extract<StressRule, { rule: "kill" }> = {
        at: v.at,
        rule: "kill",
        target: v.target,
      };
      if (num(v.count)) kill.count = v.count;
      return kill;
    }
    case "flush":
      return v.target === "cache"
        ? { at: v.at, rule: "flush", target: "cache" }
        : null;
    case "partition":
      return str(v.target) && num(v.forSec)
        ? { at: v.at, rule: "partition", target: v.target, forSec: v.forSec }
        : null;
    case "hotkey":
      return num(v.skew) && num(v.forSec)
        ? { at: v.at, rule: "hotkey", skew: v.skew, forSec: v.forSec }
        : null;
    default:
      return null;
  }
}

function parsePass(v: unknown): Scenario["pass"] | null {
  if (!isRecord(v) || !num(v.p95Ms) || !num(v.maxErrorRate)) return null;
  const pass: Scenario["pass"] = { p95Ms: v.p95Ms, maxErrorRate: v.maxErrorRate };
  if (v.consistency !== undefined) {
    if (v.consistency !== "strong") return null;
    pass.consistency = "strong";
  }
  if (v.minSurvivedKills !== undefined) {
    if (!num(v.minSurvivedKills)) return null;
    pass.minSurvivedKills = v.minSurvivedKills;
  }
  return pass;
}

/**
 * Hand-rolled schema guard (02-data-model: "zod-free, scenarios-style") —
 * mirrors persistence's parseDesignRecord. Returns a freshly-built, correctly
 * typed Scenario, or null on any malformed field. Presets pass through it at
 * load; M5's RunBundle import reuses it for untrusted files.
 */
export function parseScenario(data: unknown): Scenario | null {
  if (!isRecord(data)) return null;
  if (!str(data.id) || !str(data.name) || !str(data.description)) return null;
  if (
    !num(data.durationSec) ||
    !num(data.baseRps) ||
    !num(data.readRatio) ||
    !num(data.seed)
  ) {
    return null;
  }
  if (!Array.isArray(data.timeline)) return null;
  const timeline: StressRule[] = [];
  for (const raw of data.timeline) {
    const rule = parseRule(raw);
    if (rule === null) return null;
    timeline.push(rule);
  }
  const pass = parsePass(data.pass);
  if (pass === null) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    durationSec: data.durationSec,
    baseRps: data.baseRps,
    readRatio: data.readRatio,
    timeline,
    pass,
    seed: data.seed,
  };
}

function requirePreset(raw: unknown): Scenario {
  const scenario = parseScenario(raw);
  if (scenario === null) throw new Error("invalid scenario preset");
  return scenario;
}

/** The built-in scenarios (M3). Order is the dropdown order. */
export const SCENARIO_PRESETS: readonly Scenario[] = [
  requirePreset(blackFriday),
  requirePreset(celebrityTweet),
  requirePreset(azOutage),
];

export function listScenarioPresets(): readonly Scenario[] {
  return SCENARIO_PRESETS;
}

export function getScenarioPreset(id: string): Scenario | undefined {
  return SCENARIO_PRESETS.find((scenario) => scenario.id === id);
}

/** One human-readable timeline line for the ScenarioPanel preview. */
export function describeStressRule(rule: StressRule): string {
  switch (rule.rule) {
    case "ramp":
      return `at ${rule.at}s — ramp to ${rule.toRps} RPS over ${rule.overSec}s`;
    case "spike":
      return `at ${rule.at}s — spike ×${rule.factor} for ${rule.forSec}s`;
    case "kill":
      return `at ${rule.at}s — kill ${rule.count ?? 1} × ${rule.target}`;
    case "flush":
      return `at ${rule.at}s — flush ${rule.target}`;
    case "partition":
      return `at ${rule.at}s — partition ${rule.target} for ${rule.forSec}s`;
    case "hotkey":
      return `at ${rule.at}s — hotkey skew ${rule.skew} for ${rule.forSec}s`;
  }
}
