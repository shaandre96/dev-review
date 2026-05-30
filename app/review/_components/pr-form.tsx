"use client";

import type { KeyboardEvent, RefObject } from "react";

export function PrForm({
  prUrl,
  setPrUrl,
  token,
  setToken,
  onFetchPr,
  prInputRef,
}: {
  prUrl: string;
  setPrUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  onFetchPr: () => void;
  prInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-[14px] p-6 overflow-auto">
      <div>
        <div className="text-dim text-[11.5px] mb-[6px]">
          github pull request url
        </div>
        <div className="grid grid-cols-[1fr_auto] border border-line bg-bg">
          <input
            ref={prInputRef}
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") onFetchPr();
            }}
            placeholder="https://github.com/org/repo/pull/1234"
            className="px-3 py-[10px] bg-transparent text-fg text-[13px] outline-none placeholder-faint"
          />
          <button
            type="button"
            onClick={onFetchPr}
            className="px-[14px] border-l border-line bg-control hover:bg-control-hover text-fg text-[12px]"
          >
            Fetch diff
          </button>
        </div>
      </div>

      <div>
        <div className="text-dim text-[11.5px] mb-[6px]">
          github token{" "}
          <span className="text-dimmer">
            — optional, only for private repos
          </span>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") onFetchPr();
          }}
          placeholder="ghp_…  (leave blank for public repos)"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-3 py-[10px] border border-line bg-bg text-fg text-[13px] outline-none placeholder-faint"
        />
      </div>

      {/* Privacy: token handling. */}
      <div className="border-l-2 border-dv-amber pl-[10px] text-[11.5px] leading-[1.7] text-muted">
        <div className="text-dv-amber font-semibold mb-[2px]">privacy</div>
        Your token is sent to our server only to fetch this diff from GitHub,
        then discarded. It is never stored, logged, written to your browser, or
        sent to the model. Prefer a fine-grained, read-only, short-lived token.{" "}
        <a href="/privacy" className="text-fg-faded underline hover:text-fg">
          Privacy policy →
        </a>
      </div>

      {/* No-caching disclosure. */}
      <div className="border-l-2 border-line pl-[10px] text-[11.5px] leading-[1.7] text-dim">
        <div className="text-muted font-semibold mb-[2px]">heads up</div>
        Nothing is cached. Every run fetches a fresh diff and recomputes the
        review from scratch, so it may take a few seconds and repeating the same
        request won&apos;t return instantly.
      </div>

      <div className="text-dim text-[11.5px] leading-[1.7]">
        DevReview fetches the PR&apos;s unified diff and reviews the changed
        files, attributing each finding to its file.
      </div>
    </div>
  );
}
