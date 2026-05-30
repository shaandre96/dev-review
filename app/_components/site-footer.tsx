import Link from "next/link";

/**
 * Shared bottom footer used by `/` and `/review`. Fixed 32px tall so it slots
 * into the terminal's grid layout; works fine as a thin info bar on the
 * landing page too.
 */
export function SiteFooter() {
  return (
    <footer className="flex h-8 items-center justify-between gap-4 border-t border-line px-4 text-dim text-[11px]">
      <span className="inline-flex items-center gap-2">
        Powered by Claude
        <Dot />
        <Link href="/terms" className="hover:text-fg no-underline">
          Terms
        </Link>
        <Dot />
        <Link href="/privacy" className="hover:text-fg no-underline">
          Privacy
        </Link>
      </span>
      <a
        href="https://github.com/shaandre96/dev-review"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-[6px] hover:text-fg no-underline"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="w-[12px] h-[12px] block"
          aria-hidden
        >
          <title>GitHub</title>
          <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.66 7.66 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
        </svg>
        View source
      </a>
    </footer>
  );
}

function Dot() {
  return (
    <span className="text-line" aria-hidden>
      ·
    </span>
  );
}
