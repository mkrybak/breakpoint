import { Skull, Waves, Zap, type LucideIcon } from "lucide-react";
import type { ComponentKind, StressRule } from "@/lib/core";

/** Live chaos injections. Practice's ScenarioPanel shows `label`; Quick's "Break it" menu shows `plainLabel` + `description`. */
export interface ChaosAction {
  label: string;
  plainLabel: string;
  description: string;
  icon: LucideIcon;
  rule: StressRule;
  /** Quick only offers it when the running graph has a node of this kind. */
  requiresKind?: ComponentKind;
}

export const CHAOS_ACTIONS: readonly ChaosAction[] = [
  {
    label: "Kill server",
    plainLabel: "Kill an app server",
    description: "One app server instance goes down for the rest of the run.",
    icon: Skull,
    rule: { at: 0, rule: "kill", target: "app_server", count: 1 },
    requiresKind: "app_server",
  },
  {
    label: "Flush cache",
    plainLabel: "Flush the cache",
    description:
      "The cache empties, and reads fall through to the database until it warms up.",
    icon: Waves,
    rule: { at: 0, rule: "flush", target: "cache" },
    requiresKind: "cache",
  },
  {
    label: "Spike ×3",
    plainLabel: "Triple the traffic",
    description: "Traffic jumps to 3× for 5 seconds.",
    icon: Zap,
    rule: { at: 0, rule: "spike", factor: 3, forSec: 5 },
  },
];
