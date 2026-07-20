import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-neutral-100">
      <div>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-neutral-400">
          That page doesn’t exist.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
      >
        Back to designs
      </Link>
    </main>
  );
}
