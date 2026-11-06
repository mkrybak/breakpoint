"use client";

import { Flame, Layers } from "lucide-react";
import { formatRps } from "@/components/hud/hud-format";
import { CHAOS_ACTIONS } from "@/components/panels/chaos-actions";
import { MenuButton, MenuItem } from "@/components/quick/MenuButton";
import { switchQuickScenario } from "@/components/quick/quick-actions";
import { listQuickScenarios } from "@/lib/scenarios";
import { useScenarioStore } from "@/stores/scenario-store";
import { useSimStore } from "@/stores/sim-store";

/** Quick mode's scenario picker, behind a closed menu. Hidden while a run is live (switching would reset it); Break it takes its slot. */
export function ScenarioMenu() {
  const currentId = useScenarioStore((s) => s.scenario.id);
  const status = useSimStore((s) => s.status);

  if (status === "running" || status === "paused") return null;

  return (
    <MenuButton label="More scenarios" icon={Layers}>
      {(close) =>
        listQuickScenarios().map((s) => (
          <MenuItem
            key={s.id}
            title={s.name}
            description={s.description}
            meta={`${s.durationSec}s · ${formatRps(s.baseRps)} rps`}
            checked={s.id === currentId}
            onSelect={() => {
              switchQuickScenario(s);
              close();
            }}
          />
        ))
      }
    </MenuButton>
  );
}

/** Quick mode's live chaos, only rendered while a run is live. */
export function BreakItMenu() {
  const status = useSimStore((s) => s.status);
  const runGraph = useSimStore((s) => s.runGraph);
  const chaos = useSimStore((s) => s.chaos);

  if (status !== "running" && status !== "paused") return null;

  return (
    <MenuButton label="Break it" icon={Flame}>
      {(close) =>
        CHAOS_ACTIONS.filter(
          (a) =>
            !a.requiresKind ||
            runGraph?.nodes.some((n) => n.kind === a.requiresKind),
        ).map((a) => (
          <MenuItem
            key={a.label}
            icon={a.icon}
            title={a.plainLabel}
            description={a.description}
            onSelect={() => {
              chaos(a.rule);
              close();
            }}
          />
        ))
      }
    </MenuButton>
  );
}
