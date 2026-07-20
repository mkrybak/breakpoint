import Link from "next/link";
import { DesignCanvas } from "@/components/canvas/DesignCanvas";
import { EventLog } from "@/components/hud/EventLog";
import { MetricsBar } from "@/components/hud/MetricsBar";
import { ReplayScrubber } from "@/components/hud/ReplayScrubber";
import { Verdict } from "@/components/hud/Verdict";
import { Palette } from "@/components/palette/Palette";
import { NodeConfigPanel } from "@/components/panels/NodeConfigPanel";
import { PhaseBar } from "@/components/panels/PhaseBar";
import { PhaseNotes } from "@/components/panels/PhaseNotes";
import { RequirementsPanel } from "@/components/panels/RequirementsPanel";
import { ScenarioPanel } from "@/components/panels/ScenarioPanel";

export default async function DesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex h-dvh flex-col">
      <PhaseBar />
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="flex min-w-0 flex-1 flex-col">
          <MetricsBar />
          <div className="relative min-h-0 flex-1">
            <DesignCanvas designId={id} />
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
              <Verdict />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
              <ReplayScrubber />
            </div>
          </div>
        </main>
        <aside className="flex w-72 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <div className="flex flex-col gap-6 overflow-y-auto p-3">
            <Link
              href={`/review/${id}`}
              className="flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
            >
              Open review screen →
            </Link>
            <ScenarioPanel />
            <RequirementsPanel />
            <PhaseNotes />
          </div>
          <EventLog />
        </aside>
        <NodeConfigPanel designId={id} />
      </div>
    </div>
  );
}
