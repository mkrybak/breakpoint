"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-neutral-100">
      <div>
        <h1 className="text-lg font-semibold">Something broke</h1>
        <p className="mt-1 max-w-md text-sm text-neutral-400">
          The screen hit an unexpected error. Your saved designs are safe in this
          browser.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
        >
          Back to designs
        </Link>
      </div>
    </main>
  );
}
