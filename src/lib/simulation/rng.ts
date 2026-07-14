export type Rng = () => number;

/**
 * mulberry32 — tiny, fast, deterministic PRNG. Used only by the simulation
 * engine (kill target selection, hotkey skew — never Date.now()/Math.random())
 * so a run with the same seed replays byte-identical.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
