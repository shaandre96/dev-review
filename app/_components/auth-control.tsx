"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

/** Compact sign-in / account control for the terminal top bar. */
export function AuthControl() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-dim text-[11.5px]">…</span>;
  }

  if (!session?.user) {
    return (
      <Link
        href="/signin"
        className="text-muted hover:text-fg text-[11.5px] no-underline"
      >
        sign in
      </Link>
    );
  }

  const tier = session.user.tier ?? "free";
  return (
    <span className="inline-flex items-center gap-2 text-[11.5px]">
      <span className="px-[6px] py-px border border-line text-muted uppercase tracking-[0.04em] text-[10px]">
        {tier}
      </span>
      <Link
        href="/account"
        className="text-fg-soft hover:text-fg no-underline max-w-[160px] truncate"
        title={session.user.email ?? undefined}
      >
        {session.user.email ?? session.user.name ?? "account"}
      </Link>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-dim hover:text-fg"
      >
        sign out
      </button>
    </span>
  );
}
