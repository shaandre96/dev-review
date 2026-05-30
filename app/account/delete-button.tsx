"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

const GENERIC_ERROR =
  "We couldn't delete your account. Try again in a moment, and contact us if it keeps failing.";

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
      if (res.status === 204) {
        await signOut({ callbackUrl: "/" });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
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
          {error}{" "}
          <a
            href="/terms"
            className="underline text-[#FF5555] hover:text-[#F8F8F2]"
          >
            Contact details
          </a>
          .
        </p>
      )}
    </div>
  );
}
