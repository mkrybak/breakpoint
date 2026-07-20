export type StressRule =
  | { at: number; rule: "ramp"; toRps: number; overSec: number }
  | { at: number; rule: "spike"; factor: number; forSec: number }
  | {
      at: number;
      rule: "kill";
      /** a ComponentKind or a specific node id */
      target: string;
      count?: number;
    }
  | { at: number; rule: "flush"; target: "cache" }
  | { at: number; rule: "partition"; target: string; forSec: number }
  | { at: number; rule: "hotkey"; skew: number; forSec: number };

export interface Scenario {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  baseRps: number;
  /** 0–1 */
  readRatio: number;
  timeline: StressRule[];
  /** the NFRs; interviewer can edit before run */
  pass: {
    p95Ms: number;
    /** e.g. 0.01 */
    maxErrorRate: number;
    /** if set, verdict checks read-path consistency */
    consistency?: "strong";
    minSurvivedKills?: number;
  };
  /** determinism */
  seed: number;
}
