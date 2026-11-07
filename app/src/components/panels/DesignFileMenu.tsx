"use client";

import { useRef } from "react";
import { Download, Ellipsis, Upload, X } from "lucide-react";
import { MenuButton, MenuItem } from "@/components/quick/MenuButton";
import {
  exportCurrentDesign,
  importDesignFile,
  useDesignFileStore,
} from "@/stores/design-file-store";

/** The metrics bar's "⋯" menu (T-12.8): Export / Import JSON for the attached design. */
export function DesignFileMenu() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importError = useDesignFileStore((s) => s.importError);
  const dismissImportError = useDesignFileStore((s) => s.dismissImportError);

  return (
    <div className="relative">
      <MenuButton label="Design file" icon={Ellipsis} iconOnly align="end">
        {(close) => (
          <>
            <MenuItem
              icon={Download}
              title="Export JSON"
              description="Download this design as a .design.json file."
              onSelect={() => {
                exportCurrentDesign();
                close();
              }}
            />
            <MenuItem
              icon={Upload}
              title="Import JSON…"
              description="Replace this design with a saved file. You can also drop the file on the canvas."
              onSelect={() => {
                close();
                inputRef.current?.click();
              }}
            />
          </>
        )}
      </MenuButton>
      {/* outside the menu: its children unmount when it closes */}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-importing the same file
          if (file) void importDesignFile(file);
        }}
      />
      {importError !== null && (
        <div
          role="alert"
          className="absolute top-full right-0 z-30 mt-2 flex w-64 items-start gap-2 rounded-lg border border-red-500/40 bg-red-950/90 px-3 py-2 text-xs text-red-300 shadow-lg shadow-black/40"
        >
          <span className="flex-1">{importError}</span>
          <button
            type="button"
            aria-label="Dismiss import error"
            onClick={dismissImportError}
            className="-my-2 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-300/70 transition-colors duration-150 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-red-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
