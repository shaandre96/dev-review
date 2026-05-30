"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChangePlanButton({
  to,
  label,
  prompt,
  primary,
}: {
  to: "lite" | "pro";
  label: string;
  /** Confirm-dialog text shown before submitting. */
  prompt: string;
  /** Highlight as the upgrade path. */
  primary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subscription/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      // The server already mirrored the new tier into the DB; refresh re-reads
      // the session and updates the displayed plan.
      router.refresh();
    } catch {
      setError("Couldn't change plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`px-4 py-[8px] border text-[12.5px] disabled:opacity-50 ${
          primary
            ? "border-[#50FA7B] bg-[rgba(80,250,123,0.08)] text-[#50FA7B] hover:bg-[rgba(80,250,123,0.14)]"
            : "border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2]"
        }`}
      >
        {busy ? "Updating…" : label}
      </button>
      {error && (
        <p className="mt-2 text-[#FF5555] text-[11.5px]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
