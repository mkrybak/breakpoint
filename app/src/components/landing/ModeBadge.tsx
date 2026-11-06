import { GraduationCap, Users, Zap, type LucideIcon } from "lucide-react";
import type { DesignMode } from "@/persistence/local";

const BADGES: Record<DesignMode, { label: string; icon: LucideIcon; className: string }> = {
  quick: { label: "Quick", icon: Zap, className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  practice: {
    label: "Practice",
    icon: GraduationCap,
    className: "border-neutral-700 bg-neutral-800 text-neutral-300",
  },
  interview: {
    label: "Interview",
    icon: Users,
    className: "border-neutral-700 bg-neutral-800 text-neutral-300",
  },
};

/** Mode chip for saved-design rows: icon + label, so mode never reads by colour alone. */
export function ModeBadge({ mode }: { mode: DesignMode }) {
  const { label, icon: Icon, className } = BADGES[mode];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${className}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
