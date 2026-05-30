"use client";

import { signIn, useSession } from "next-auth/react";

/**
 * Pricing-card CTA for paid tiers. If signed in, navigates to the checkout
 * route (plain navigation, not a prefetched Link, so it won't fire on hover);
 * otherwise sends the user to sign in and back to the pricing section.
 */
export function CheckoutButton({
  tier,
  label,
  highlight,
}: {
  tier: "lite" | "pro";
  label: string;
  highlight?: boolean;
}) {
  const { status } = useSession();

  function onClick() {
    const destination = `/api/checkout?tier=${tier}`;
    if (status === "authenticated") {
      window.location.href = destination;
    } else {
      // After sign-in, Auth.js redirects to this callbackUrl which auto-starts
      // checkout — so it's a single click for the user, not two.
      void signIn(undefined, { callbackUrl: destination });
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "loading"}
      className={`mt-6 text-center px-4 py-[10px] text-[13px] border disabled:opacity-50 ${
        highlight
          ? "border-[#50FA7B] bg-[rgba(80,250,123,0.08)] text-[#50FA7B] hover:bg-[rgba(80,250,123,0.14)]"
          : "border-[#2A2A2A] bg-[#1F1F1F] hover:bg-[#232323] text-[#F8F8F2]"
      }`}
    >
      {label}
    </button>
  );
}
