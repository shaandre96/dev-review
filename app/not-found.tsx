import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-bg text-fg font-mono text-[13px] flex items-center justify-center px-6">
      <div className="max-w-[520px] text-center">
        <p className="text-dimmer text-[11px] tracking-[0.04em] uppercase">
          404
        </p>
        <h1 className="mt-2 text-[20px] font-semibold">Page not found</h1>
        <p className="mt-3 text-fg-soft leading-[1.7]">
          The page you were looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6 inline-flex gap-3">
          <Link
            href="/"
            className="px-4 py-[10px] border border-line bg-control hover:bg-control-hover text-fg text-[12.5px] no-underline"
          >
            Back to home
          </Link>
          <Link
            href="/review"
            className="px-4 py-[10px] text-muted hover:text-fg text-[12.5px] no-underline"
          >
            Open the terminal →
          </Link>
        </div>
      </div>
    </main>
  );
}
