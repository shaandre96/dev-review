"use client";

import type { RefObject } from "react";
import {
  type Effort,
  MODEL_PRICING,
  type ModelId,
  type Tier,
} from "@/lib/tiers";
import { GhostBtn, Kbd, PaneFoot, PaneHead } from "./bits";
import { PrForm } from "./pr-form";

/**
 * The left pane: language badge + model/effort picker (head), the paste
 * editor or the PR form (body), and the line/char counter + Clear button
 * (foot). All state stays in the parent so the streaming state machine has a
 * single home.
 */
export function InputPane({
  tab,
  tier,
  model,
  setModel,
  effort,
  setEffort,
  langBadge,
  code,
  setCode,
  codeRef,
  gutterRef,
  gutterText,
  onEditorScroll,
  prUrl,
  setPrUrl,
  token,
  setToken,
  onFetchPr,
  prInputRef,
  lineCount,
  charCount,
  onClear,
}: {
  tab: "paste" | "pr";
  tier: Tier;
  model: ModelId;
  setModel: (m: ModelId) => void;
  effort: Effort;
  setEffort: (e: Effort) => void;
  langBadge: { label: string; cls: string };
  code: string;
  setCode: (v: string) => void;
  codeRef: RefObject<HTMLTextAreaElement | null>;
  gutterRef: RefObject<HTMLDivElement | null>;
  gutterText: string;
  onEditorScroll: () => void;
  prUrl: string;
  setPrUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  onFetchPr: () => void;
  prInputRef: RefObject<HTMLInputElement | null>;
  lineCount: number;
  charCount: number;
  onClear: () => void;
}) {
  return (
    <section
      className="bg-surface grid min-h-0 min-w-0 border-r border-line"
      style={{ gridTemplateRows: "36px 1fr 32px" }}
    >
      <PaneHead>
        <span className="inline-flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-[2px] rounded-[2px] text-[11px] tracking-[0.02em] border ${langBadge.cls}`}
          >
            {langBadge.label}
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            disabled={tier.allowedModels.length <= 1}
            title="Model"
            className="bg-bg border border-line text-fg-soft text-[11px] px-1 py-[2px] outline-none disabled:opacity-60"
          >
            {tier.allowedModels.map((m) => (
              <option key={m} value={m}>
                {MODEL_PRICING[m].label}
              </option>
            ))}
          </select>
          {tier.effortChoice ? (
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as Effort)}
              title="Effort"
              className="bg-bg border border-line text-fg-soft text-[11px] px-1 py-[2px] outline-none"
            >
              {(["low", "medium", "high", "xhigh"] as const).map((ef) => (
                <option key={ef} value={ef}>
                  {ef}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-dimmer text-[11px]">{effort}</span>
          )}
        </span>
        <span className="text-dim text-[11.5px] whitespace-nowrap">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
          <span className="ml-1">to review</span>
        </span>
      </PaneHead>

      {tab === "paste" ? (
        <div
          className="grid min-h-0 overflow-hidden"
          style={{ gridTemplateColumns: "48px 1fr" }}
        >
          <div
            ref={gutterRef}
            className="bg-surface border-r border-line-soft text-[#3F4148] text-[12px] text-right pr-2 pt-[10px] select-none overflow-hidden whitespace-pre leading-[1.55]"
          >
            {gutterText}
          </div>
          <textarea
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={onEditorScroll}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="// Paste a function, file, or diff…"
            className="w-full h-full bg-transparent text-fg font-mono text-[13px] leading-[1.55] resize-none border-0 outline-none whitespace-pre overflow-auto px-3 pt-[10px] pb-6 placeholder-faint"
            style={{ tabSize: 2, caretColor: "#50FA7B" }}
          />
        </div>
      ) : (
        <PrForm
          prUrl={prUrl}
          setPrUrl={setPrUrl}
          token={token}
          setToken={setToken}
          onFetchPr={onFetchPr}
          prInputRef={prInputRef}
        />
      )}

      <PaneFoot>
        <span className="text-dimmer text-[11px]">
          {lineCount} line{lineCount === 1 ? "" : "s"} · {charCount} char
          {charCount === 1 ? "" : "s"}
        </span>
        <GhostBtn onClick={onClear}>Clear</GhostBtn>
      </PaneFoot>
    </section>
  );
}
