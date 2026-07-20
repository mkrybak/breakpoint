import type { MainToWorker, WorkerToMain } from "./worker-host";

/** A plain transport over the sim worker — post messages in, get them out. */
export interface SimWorkerHandle {
  post: (msg: MainToWorker) => void;
  dispose: () => void;
}

/**
 * Browser-only: spawn the dedicated sim worker and adapt it to a
 * {@link SimWorkerHandle}. `new Worker(new URL("./worker.ts", import.meta.url))`
 * is the static form Next/Turbopack recognizes to emit `worker.ts` as its own
 * chunk (turbopack API-reference doc — `new Worker()` is supported);
 * `{ type: "module" }` loads it as an ES module (worker.ts uses `import`).
 *
 * Never called in tests: `Worker` is undefined under vitest's node env, so
 * sim-store injects a fake factory there ({@link setSimWorkerFactory}). This
 * helper lives in the engine (not the store) so the reference to `./worker.ts`
 * is simulation-internal — no deep cross-engine import from the shell.
 */
export function createSimWorker(
  onMessage: (msg: WorkerToMain) => void,
): SimWorkerHandle {
  const worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<WorkerToMain>) =>
    onMessage(event.data);
  return {
    post: (msg) => worker.postMessage(msg),
    dispose: () => worker.terminate(),
  };
}
