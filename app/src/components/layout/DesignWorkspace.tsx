"use client";

import { useEffect, type ComponentType } from "react";
import {
  InterviewPreviewWorkspace,
  PracticeWorkspace,
} from "@/components/layout/PracticeWorkspace";
import { QuickWorkspace } from "@/components/quick/QuickWorkspace";
import type { DesignMode } from "@/persistence/local";
import { useDesignStore } from "@/stores/design-store";

const WORKSPACE_BY_MODE: Record<
  DesignMode,
  ComponentType<{ designId: string }>
> = {
  quick: QuickWorkspace,
  practice: PracticeWorkspace,
  interview: InterviewPreviewWorkspace, // M11 replaces this entry
};

/** /design/[id]: attaches the design, then renders the layout for its mode (T-7.5). */
export function DesignWorkspace({ designId }: { designId: string }) {
  const attachDesign = useDesignStore((s) => s.attachDesign);
  const attachedId = useDesignStore((s) => s.designId);
  const mode = useDesignStore((s) => s.designMode);

  useEffect(() => {
    attachDesign(designId);
  }, [attachDesign, designId]);

  // mode is only meaningful once this id is attached; avoids flashing the wrong layout
  if (attachedId !== designId) {
    return <div className="h-dvh bg-neutral-950" aria-busy="true" />;
  }
  const Workspace = WORKSPACE_BY_MODE[mode];
  return <Workspace designId={designId} />;
}
