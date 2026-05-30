/**
 * Long-form prose primitives shared by /privacy and /terms (and any future
 * legal/marketing copy pages). Server components — no client state.
 */

import type { ReactNode } from "react";

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[14px] font-semibold text-fg lowercase tracking-[0.02em]">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function Em({ children }: { children: ReactNode }) {
  return <span className="text-fg font-semibold">{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-code border border-line-soft rounded-[2px] px-[4px] text-fg-soft">
      {children}
    </code>
  );
}
