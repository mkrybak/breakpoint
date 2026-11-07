import { create } from "zustand";
import {
  buildDesignRecord,
  exportDesignFile,
  parseDesignRecord,
} from "@/persistence/local";
import { useDesignStore } from "./design-store";

export const INVALID_DESIGN_FILE = "Not a valid design file";
export const UNREADABLE_DESIGN_FILE = "Could not read that file";

interface DesignFileStore {
  /** message from the last failed import (menu or canvas drop); null when none */
  importError: string | null;
  dismissImportError: () => void;
}

/** Export/import of the attached design (T-12.8): shared by the ⋯ menu and the canvas drop. */
export const useDesignFileStore = create<DesignFileStore>((set) => ({
  importError: null,
  dismissImportError: () => set({ importError: null }),
}));

/** Download the attached design as `<slug>.design.json`. No-op before a design is attached. */
export function exportCurrentDesign(): void {
  const s = useDesignStore.getState();
  if (s.designId === null) return;
  exportDesignFile(
    buildDesignRecord(
      s.designId,
      s.designName,
      s.graph,
      s.designMode,
      s.phaseNotes,
      s.actionLog,
    ),
  );
}

/** Replace the attached design with a file's graph, name, notes and log (mode kept, T-7.2). Returns whether it imported. */
export async function importDesignFile(file: File): Promise<boolean> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    useDesignFileStore.setState({ importError: UNREADABLE_DESIGN_FILE });
    return false;
  }
  const record = parseDesignRecord(text);
  if (record === null) {
    useDesignFileStore.setState({ importError: INVALID_DESIGN_FILE });
    return false;
  }
  useDesignStore.getState().importRecord(record);
  useDesignFileStore.setState({ importError: null });
  return true;
}
