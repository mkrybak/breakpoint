"use client";

import { useLayoutEffect } from "react";
import { DesignCanvas } from "@/components/canvas/DesignCanvas";
import { EventLog } from "@/components/hud/EventLog";
import { describeScenarioGoal, formatRps } from "@/components/hud/hud-format";
import { MetricsBar } from "@/components/hud/MetricsBar";
import { ReplayScrubber } from "@/components/hud/ReplayScrubber";
import { Verdict } from "@/components/hud/Verdict";
import { SmallScreenNotice } from "@/components/layout/SmallScreenNotice";
import { Palette } from "@/components/palette/Palette";
import { NodeConfigPanel } from "@/components/panels/NodeConfigPanel";
import { ChallengeCard } from "@/components/quick/ChallengeCard";
import { BreakItMenu, ScenarioMenu } from "@/components/quick/QuickMenus";
import {
  leaveQuickMode,
  switchQuickScenario,
} from "@/components/quick/quick-actions";
import { TryPracticeLink } from "@/components/quick/TryPracticeLink";
import { STARTER_SCENARIO } from "@/lib/scenarios";
import { useScenarioStore } from "@/stores/scenario-store";

/** The Quick-mode workspace: no phases, simple HUD, plain verdict (T-7.5). */
export function QuickWorkspace({ designId }: { designId: string }) {
  // Layout effect: the starter is selected before first paint (no flash of Practice's preset).
  useLayoutEffect(() => {
    switchQuickScenario(STARTER_SCENARIO);
    return leaveQuickMode;
  }, [designId]);

  return (
    <div className="flex h-dvh flex-col">
      <SmallScreenNotice />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="flex min-w-0 flex-1 flex-col">
          <MetricsBar
            variant="simple"
            controls={
              <>
                <ScenarioMenu />
                <BreakItMenu />
              </>
            }
          />
          <div className="relative min-h-0 flex-1">
            <DesignCanvas designId={designId} lockable={false} />
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
              <Verdict variant="plain" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
              <ReplayScrubber />
            </div>
          </div>
        </main>
        <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="flex flex-col gap-6 overflow-y-auto p-3">
            <QuickScenarioSummary />
            <ChallengeCard />
            <TryPracticeLink />
          </div>
          <EventLog />
        </aside>
        <NodeConfigPanel designId={designId} />
      </div>
    </div>
  );
}

function QuickScenarioSummary() {
  const scenario = useScenarioStore((s) => s.scenario);
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wide text-neutral-400 uppercase">
        Scenario
      </h2>
      <p className="mt-2 text-sm font-medium text-neutral-100">
        {scenario.name}
      </p>
      <p className="mt-1 text-xs leading-snug text-neutral-400">
        {scenario.description}
      </p>
      <p className="mt-2 text-xs text-neutral-300">
        {describeScenarioGoal(scenario)}
      </p>
      <p className="mt-1 font-mono text-[11px] text-neutral-500">
        {scenario.durationSec}s · {formatRps(scenario.baseRps)} rps
      </p>
    </section>
  );
}
