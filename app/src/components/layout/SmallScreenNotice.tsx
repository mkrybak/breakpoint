import { Smartphone } from "lucide-react";

export function SmallScreenNotice() {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 lg:hidden">
      <Smartphone className="h-4 w-4 shrink-0" />
      <span>
        The design workspace is built for a larger screen — rotate or switch to a
        desktop for the full canvas. You can still scroll and read here.
      </span>
    </div>
  );
}
