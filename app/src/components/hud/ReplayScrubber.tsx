"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useSimStore } from "@/stores/sim-store";

export function ReplayScrubber() {
  const status = useSimStore((s) => s.status);
  const frames = useSimStore((s) => s.frames);
  const replayIndex = useSimStore((s) => s.replayIndex);
  const scrubTo = useSimStore((s) => s.scrubTo);
  const [playing, setPlaying] = useState(false);

  // Leaving the finished state (re-run, reset) stops playback. Adjusted during
  // render (React's documented pattern for resetting state on a store change),
  // not in a useEffect — a bare setState-on-status-change effect trips
  // eslint's react-hooks/set-state-in-effect.
  const [prevStatus, setPrevStatus] = useState(status);
  if (prevStatus !== status) {
    setPrevStatus(status);
    if (status !== "done") setPlaying(false);
  }

  // Playback: advance one frame per 100 ms; read fresh state via getState so the
  // interval closure never goes stale. Stop when we reach the last frame.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const s = useSimStore.getState();
      const next = (s.replayIndex ?? 0) + 1;
      if (next >= s.frames.length) {
        s.scrubTo(s.frames.length - 1);
        setPlaying(false);
      } else {
        s.scrubTo(next);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  if (status !== "done" || frames.length === 0) return null;

  const last = frames.length - 1;
  const index = Math.min(replayIndex ?? last, last);
  const atEnd = index >= last;
  const nowSec = frames[index]?.t ?? 0;
  const endSec = frames[last]?.t ?? 0;

  const toggle = () => {
    if (!playing && atEnd) scrubTo(0); // finished at the end → replay from the top
    setPlaying((p) => !p);
  };

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900/90 px-3 py-2 shadow-lg backdrop-blur">
      <button
        onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-neutral-200 hover:border-neutral-500"
        aria-label={playing ? "Pause replay" : "Play replay"}
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(event) => {
          setPlaying(false);
          scrubTo(event.target.valueAsNumber);
        }}
        aria-label="Replay position"
        className="h-1 w-56 cursor-pointer accent-sky-400"
      />
      <span className="min-w-16 font-mono text-[11px] text-neutral-400">
        {nowSec.toFixed(1)}s / {endSec.toFixed(1)}s
      </span>
    </div>
  );
}
