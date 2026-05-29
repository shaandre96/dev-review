"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function DeleteAccountButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (
      !window.confirm(
        "Permanently delete your account and all associated data? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      await signOut({ callbackUrl: "/" });
    } catch {
      setBusy(false);
      setError("Couldn't delete the account. Please try again.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="px-4 py-[10px] border border-[#FF5555] text-[#FF5555] hover:bg-[rgba(255,85,85,0.08)] text-[12.5px] disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete account"}
      </button>
      {error && (
        <p className="mt-2 text-[#FF5555] text-[11.5px]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
