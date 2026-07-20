"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-neutral-100">
        <div>
          <h1 className="text-lg font-semibold">Something broke</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Reload the page to continue.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
