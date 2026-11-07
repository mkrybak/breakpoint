import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignGraph } from "../src/lib/core";
import {
  buildDesignRecord,
  emptyPhaseNotes,
  exportDesignFile,
} from "../src/persistence/local";
import {
  exportCurrentDesign,
  importDesignFile,
  INVALID_DESIGN_FILE,
  useDesignFileStore,
} from "../src/stores/design-file-store";
import { emptyGraph, useDesignStore } from "../src/stores/design-store";

vi.mock("../src/persistence/local", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/persistence/local")>()),
  exportDesignFile: vi.fn(),
}));

function createStorageMock() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

function clientGraph(): DesignGraph {
  return {
    entryNodeId: "c",
    nodes: [
      {
        id: "c",
        kind: "client",
        label: "Imported client",
        position: { x: 0, y: 0 },
        config: {},
      },
    ],
    edges: [],
  };
}

function validFile(): File {
  return new File(
    [JSON.stringify(buildDesignRecord("other", "Imported", clientGraph(), "quick"))],
    "x.design.json",
  );
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorageMock());
  vi.mocked(exportDesignFile).mockClear();
  useDesignStore.setState({
    designId: null,
    designName: "Untitled design",
    designMode: "practice",
    graph: emptyGraph(),
    selectedNodeIds: [],
    selectedEdgeIds: [],
    measured: {},
    phaseNotes: emptyPhaseNotes(),
    actionLog: [],
    actionSnapshots: [],
  });
  useDesignFileStore.setState({ importError: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importDesignFile (T-12.8)", () => {
  it("imports a valid file's graph and name, keeping the current mode", async () => {
    await expect(importDesignFile(validFile())).resolves.toBe(true);
    const s = useDesignStore.getState();
    expect(s.graph).toEqual(clientGraph());
    expect(s.designName).toBe("Imported");
    expect(s.designMode).toBe("practice");
    expect(useDesignFileStore.getState().importError).toBeNull();
  });

  it("rejects an invalid file and leaves the graph untouched", async () => {
    const graph = useDesignStore.getState().graph;
    await expect(importDesignFile(new File(["not json"], "x.json"))).resolves.toBe(
      false,
    );
    expect(useDesignFileStore.getState().importError).toBe(INVALID_DESIGN_FILE);
    expect(useDesignStore.getState().graph).toBe(graph);
  });

  it("a successful import clears an earlier error; dismiss clears it too", async () => {
    await importDesignFile(new File(["not json"], "x.json"));
    expect(useDesignFileStore.getState().importError).toBe(INVALID_DESIGN_FILE);
    await importDesignFile(validFile());
    expect(useDesignFileStore.getState().importError).toBeNull();

    useDesignFileStore.setState({ importError: INVALID_DESIGN_FILE });
    useDesignFileStore.getState().dismissImportError();
    expect(useDesignFileStore.getState().importError).toBeNull();
  });
});

describe("exportCurrentDesign (T-12.8)", () => {
  it("does nothing before a design is attached", () => {
    exportCurrentDesign();
    expect(exportDesignFile).not.toHaveBeenCalled();
  });

  it("exports the attached design", () => {
    useDesignStore.setState({ designId: "d1", designName: "N" });
    exportCurrentDesign();
    expect(exportDesignFile).toHaveBeenCalledTimes(1);
    const record = vi.mocked(exportDesignFile).mock.calls[0][0];
    expect(record.id).toBe("d1");
    expect(record.name).toBe("N");
    expect(record.mode).toBe("practice");
    expect(record.graph).toEqual(useDesignStore.getState().graph);
  });
});
