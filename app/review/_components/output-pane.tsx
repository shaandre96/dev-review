"use client";

import type { RefObject } from "react";
import {
  ChunkView,
  ErrorBanner,
  GhostBtn,
  PaneFoot,
  PaneHead,
  type ReviewChunk,
  type ReviewError,
} from "./bits";

export function OutputPane({
  chunks,
  error,
  elapsed,
  copyLabel,
  outputRef,
  onCopy,
  onReRun,
}: {
  chunks: ReviewChunk[];
  error: ReviewError | null;
  elapsed: string;
  copyLabel: string;
  outputRef: RefObject<HTMLDivElement | null>;
  onCopy: () => void;
  onReRun: () => void;
}) {
  return (
    <section
      className="bg-surface grid min-h-0 min-w-0"
      style={{ gridTemplateRows: "36px 1fr 32px" }}
    >
      <PaneHead>
        <span className="text-muted text-[11.5px] tracking-[0.02em] lowercase">
          review output
        </span>
        <GhostBtn onClick={onCopy}>{copyLabel}</GhostBtn>
      </PaneHead>

      <div
        ref={outputRef}
        className="overflow-auto px-4 pt-[14px] pb-[18px] text-[13px] leading-[1.65] whitespace-pre-wrap break-words"
      >
        {chunks.length === 0 && !error ? (
          <div className="text-dim text-[12.5px] leading-[1.8] space-y-1">
            <div>
              <span className="text-dv-green">→</span> Paste a file in the left
              pane.
            </div>
            <div>
              <span className="text-dv-green">→</span> Press{" "}
              <span className="text-fg-soft">⌘ Enter</span> to start a review.
            </div>
            <div>
              <span className="text-dv-green">→</span> Output streams here line
              by line.
            </div>
            <div>
              <span className="text-dv-green">→</span> Nothing is cached — each
              review runs fresh, so give it a few seconds.
            </div>
          </div>
        ) : (
          <>
            {chunks.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: review output is append-only and never reorders
              <ChunkView key={i} chunk={c} />
            ))}
            {error && <ErrorBanner error={error} />}
          </>
        )}
      </div>

      <PaneFoot>
        <span className="text-dimmer text-[11px]">{elapsed}</span>
        <GhostBtn onClick={onReRun}>Re-run</GhostBtn>
      </PaneFoot>
    </section>
  );
}
