"use client";

import type { ReactNode } from "react";

/* ---- types shared between the streaming state machine and the renderer ---- */

export type Tag = "security" | "perf" | "style" | "good";

export type ReviewChunk =
  | { kind: "header"; file: string }
  | { kind: "item"; tag: Tag; line?: number; body: string; file?: string }
  | { kind: "summary"; issues: number; suggestions: number; positives: number };

export type ReviewError = { code: string; message: string };

const TAG_COLOR: Record<Tag, string> = {
  security: "text-dv-red",
  perf: "text-dv-amber",
  style: "text-dim",
  good: "text-dv-green",
};

/* ---- small UI primitives used by the terminal ----------------------------- */

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-[14px] py-[6px] text-[12px] transition-colors select-none ${
        active ? "bg-control text-fg" : "text-muted hover:text-fg-soft"
      }`}
    >
      {children}
    </button>
  );
}

export function StatusDot({ reviewing }: { reviewing: boolean }) {
  return (
    <span
      className={`relative inline-block w-[7px] h-[7px] rounded-full transition-colors ${
        reviewing ? "bg-dv-green dv-pulse" : "bg-[#3A3A3A]"
      }`}
    />
  );
}

export function PaneHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[14px] border-b border-line text-dim text-[11.5px]">
      {children}
    </div>
  );
}

export function PaneFoot({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[14px] border-t border-line text-dim text-[11.5px]">
      {children}
    </div>
  );
}

export function GhostBtn({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted hover:text-fg transition-colors py-1 text-[11.5px] cursor-pointer"
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-fg-soft bg-control border border-line px-[5px] py-px rounded-[2px] mx-px">
      {children}
    </kbd>
  );
}

/* ---- streamed review chunks + error renderer ------------------------------ */

/** Render simple `code` spans inside review bodies without dangerouslySetInnerHTML. */
function renderBody(body: string) {
  const parts = body.split(/(`[^`]+`)/g);
  return parts.map((p, i) =>
    p.startsWith("`") && p.endsWith("`") ? (
      <code
        // biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split and never reorder
        key={i}
        className="bg-code border border-line-soft rounded-[2px] px-[4px] text-fg-soft"
      >
        {p.slice(1, -1)}
      </code>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split and never reorder
      <span key={i}>{p}</span>
    ),
  );
}

export function ChunkView({ chunk }: { chunk: ReviewChunk }) {
  if (chunk.kind === "header") {
    return (
      <div className="flex gap-[10px] items-start border-l-2 border-line pl-[10px] py-[2px] mb-[14px] text-muted">
        <span>analysing:</span>
        <span className="text-fg">{chunk.file}</span>
      </div>
    );
  }
  if (chunk.kind === "item") {
    return (
      <div
        className="grid gap-[10px] mb-3"
        style={{ gridTemplateColumns: "92px 1fr" }}
      >
        <span
          className={`font-semibold tracking-[0.02em] ${TAG_COLOR[chunk.tag]}`}
        >
          [{chunk.tag.toUpperCase()}]
        </span>
        <span className="text-fg">
          {chunk.file ? (
            <span className="text-muted">
              {chunk.file}
              {chunk.line !== undefined ? `:${chunk.line}` : ""} —{" "}
            </span>
          ) : chunk.line !== undefined ? (
            <span className="text-muted">Line {chunk.line} — </span>
          ) : null}
          {renderBody(chunk.body)}
        </span>
      </div>
    );
  }
  /* summary */
  return (
    <>
      <hr className="border-0 border-t border-line my-[18px] mb-3" />
      <div className="text-muted text-[12px] flex gap-[14px] items-center">
        <span>
          <Dot color="#FF5555" /> {chunk.issues} issues
        </span>
        <span>
          <Dot color="#6C7280" /> {chunk.suggestions} suggestion
        </span>
        <span>
          <Dot color="#50FA7B" /> {chunk.positives} positive
        </span>
      </div>
    </>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-[6px] h-[6px] mr-[6px] align-middle"
      style={{ background: color }}
    />
  );
}

export function ErrorBanner({ error }: { error: ReviewError }) {
  return (
    <div
      className="grid gap-[10px] mb-3 mt-3 border-l-2 border-dv-red pl-[10px] py-[2px]"
      style={{ gridTemplateColumns: "92px 1fr" }}
      role="alert"
    >
      <span className="font-semibold tracking-[0.02em] text-dv-red">
        [ERROR]
      </span>
      <span className="text-fg">
        <span className="text-muted">{error.code}</span> — {error.message}
      </span>
    </div>
  );
}
