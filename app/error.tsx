"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Renders when an unhandled error escapes any
 * route segment under /app — replaces Next's bare default with a styled
 * fallback that lets the user retry or escape back to the landing page.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console so dev/Vercel logs capture it. Real error reporting
    // (Sentry/etc.) can hook in here when we add it.
    console.error("Route error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg text-fg font-mono text-[13px] flex items-center justify-center px-6">
      <div className="max-w-[520px] text-center">
        <h1 className="text-[20px] font-semibold">Something went wrong</h1>
        <p className="mt-3 text-fg-soft leading-[1.7]">
          An unexpected error happened. You can try again, or head back to the
          landing page.
        </p>
        {error.digest && (
          <p className="mt-3 text-dimmer text-[11.5px]">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 inline-flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-[10px] border border-line bg-control hover:bg-control-hover text-fg text-[12.5px]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-[10px] text-muted hover:text-fg text-[12.5px] no-underline"
          >
            Back to home →
          </Link>
        </div>
      </div>
    </main>
  );
}
