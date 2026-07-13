"use client";

import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const defaultNodes = [
  { id: "client", position: { x: 0, y: 0 }, data: { label: "Client" } },
  { id: "lb", position: { x: 220, y: 120 }, data: { label: "Load balancer" } },
  { id: "app", position: { x: 440, y: 240 }, data: { label: "App server" } },
];

const defaultEdges = [
  { id: "client-lb", source: "client", target: "lb", animated: true },
  { id: "lb-app", source: "lb", target: "app", animated: true },
];

export function DesignCanvas({ designId }: { designId: string }) {
  return (
    <div style={{ height: "100dvh" }} aria-label={`Design ${designId}`}>
      <ReactFlow
        defaultNodes={defaultNodes}
        defaultEdges={defaultEdges}
        fitView
        colorMode="dark"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
