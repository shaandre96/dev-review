"use client";

import Link from "next/link";
import { AuthControl } from "../../_components/auth-control";
import { StatusDot, TabButton } from "./bits";

export function TopBar({
  tab,
  onChangeTab,
  isReviewing,
}: {
  tab: "paste" | "pr";
  onChangeTab: (tab: "paste" | "pr") => void;
  isReviewing: boolean;
}) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center px-[14px] border-b border-line bg-bg">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-fg-strong no-underline hover:text-fg"
      >
        <span className="inline-block w-[6px] h-[6px] bg-fg" />
        dev<span className="font-normal text-dim">·</span>review
      </Link>

      <div
        role="tablist"
        aria-label="Input mode"
        className="inline-flex items-center border border-line bg-surface"
      >
        <TabButton
          active={tab === "paste"}
          onClick={() => onChangeTab("paste")}
        >
          Paste code
        </TabButton>
        <span className="w-px self-stretch bg-line" aria-hidden />
        <TabButton active={tab === "pr"} onClick={() => onChangeTab("pr")}>
          GitHub PR URL
        </TabButton>
      </div>

      <div className="justify-self-end inline-flex items-center gap-3 text-dim text-[11.5px]">
        <AuthControl />
        <span className="w-px self-stretch bg-line my-1" aria-hidden />
        <span className="inline-flex items-center gap-2">
          <StatusDot reviewing={isReviewing} />
          {isReviewing ? "reviewing…" : "idle"}
        </span>
      </div>
    </header>
  );
}
