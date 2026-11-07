"use client";

import { useState } from "react";
import type { EdgeBreaker } from "@/lib/core";
import {
  BREAKER_LIMITS,
  BREAKER_PROBE_FRACTION,
  DEFAULT_BREAKER,
} from "@/lib/simulation";
import { FIELD_LABEL, INPUT } from "./styles";

type Limit = { min: number; max: number; step: number };

/**
 * Number field that edits a local draft: typing never clamps mid-number
 * ("30" passes through 3), and only in-range values reach the design. Blur or
 * Enter clamps the draft to the limits; empty or junk reverts.
 */
function Field({
  label,
  ariaLabel,
  value,
  limit,
  scale,
  onValue,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  limit: Limit;
  scale: number;
  onValue: (v: number) => void;
}) {
  const format = (v: number) => String(Math.round(v * scale * 100) / 100);
  const [draft, setDraft] = useState(() => format(value));
  const [synced, setSynced] = useState(value);
  const [focused, setFocused] = useState(false);
  // re-sync from the design when it changes underneath us (not mid-edit)
  if (value !== synced && !focused) {
    setSynced(value);
    setDraft(format(value));
  }
  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(format(value));
      return;
    }
    const clamped = Math.min(limit.max, Math.max(limit.min, parsed / scale));
    onValue(clamped);
    setDraft(format(clamped));
  };

  return (
    <label className="block">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="number"
        min={limit.min * scale}
        max={limit.max * scale}
        step={limit.step * scale}
        value={draft}
        aria-label={ariaLabel}
        className={INPUT}
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = event.target.valueAsNumber / scale;
          // tolerance: scaled limits aren't always exact in binary (0.95 × 100)
          const eps = 1e-9;
          if (
            Number.isFinite(next) &&
            next >= limit.min - eps &&
            next <= limit.max + eps
          ) {
            onValue(Math.min(limit.max, Math.max(limit.min, next)));
          }
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

/** Edge-section breaker group: off = no breaker; on = DEFAULT_BREAKER, three editable fields (T-8.6). */
export function BreakerControls({
  breaker,
  onChange,
}: {
  breaker: EdgeBreaker | undefined;
  onChange: (next: EdgeBreaker | undefined) => void;
}) {
  const probePct = Math.round(BREAKER_PROBE_FRACTION * 100);
  return (
    <div className="space-y-3">
      <label
        className="flex min-h-8 cursor-pointer items-center gap-2"
        title={`Circuit breaker: when this call's error rate stays above the threshold for the trip window, calls fail fast (no load on the target) for the cooldown, then ${probePct}% of calls probe for one tick — success closes it, failure re-opens it.`}
      >
        <input
          type="checkbox"
          checked={breaker !== undefined}
          aria-label="Circuit breaker"
          className="size-4 accent-sky-500"
          onChange={(event) =>
            onChange(event.target.checked ? { ...DEFAULT_BREAKER } : undefined)
          }
        />
        <span className="text-xs text-neutral-300">Enabled</span>
      </label>
      {breaker && (
        <>
          <Field
            label="Open at (% errors)"
            ariaLabel="Breaker error threshold (%)"
            value={breaker.errorThreshold}
            limit={BREAKER_LIMITS.errorThreshold}
            scale={100}
            onValue={(errorThreshold) =>
              onChange({ ...breaker, errorThreshold })
            }
          />
          <Field
            label="Trip window (s)"
            ariaLabel="Breaker trip window (s)"
            value={breaker.tripAfterSec}
            limit={BREAKER_LIMITS.tripAfterSec}
            scale={1}
            onValue={(tripAfterSec) => onChange({ ...breaker, tripAfterSec })}
          />
          <Field
            label="Cooldown (s)"
            ariaLabel="Breaker cooldown (s)"
            value={breaker.cooldownSec}
            limit={BREAKER_LIMITS.cooldownSec}
            scale={1}
            onValue={(cooldownSec) => onChange({ ...breaker, cooldownSec })}
          />
          <p className="text-[11px] text-neutral-500">
            Opens after the error rate stays above the threshold for the trip
            window. While open, calls fail fast at the caller and the target
            gets no load. After the cooldown, {probePct}% of calls probe for one
            tick.
          </p>
        </>
      )}
    </div>
  );
}
