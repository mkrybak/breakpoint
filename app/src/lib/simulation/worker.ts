import {
  createWorkerHost,
  type MainToWorker,
  type WorkerToMain,
} from "./worker-host";

// The dedicated-worker entry: bind the host to the worker globals. Typed by
// hand — tsconfig loads the dom lib, not webworker, and they disagree about
// `self`. Never import this from the main thread; index.ts re-exports the
// protocol types from worker-host instead.
const scope = self as unknown as {
  postMessage(message: WorkerToMain): void;
  onmessage: ((event: MessageEvent<MainToWorker>) => void) | null;
};

const host = createWorkerHost((msg) => scope.postMessage(msg));
scope.onmessage = (event) => host.handle(event.data);
