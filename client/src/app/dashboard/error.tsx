"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-sm font-semibold text-red-800">Failed to load dashboard data</h2>
      <p className="mt-1 text-sm text-red-600">
        {error.digest ? `(${error.digest})` : "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="mt-3 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
      >
        Try again
      </button>
    </div>
  );
}
