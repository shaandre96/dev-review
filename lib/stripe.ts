/**
 * Stripe client + price↔tier mapping.
 *
 * The client is lazy (constructed on first use) so importing this module never
 * requires STRIPE_SECRET_KEY at build time. The mapping functions are pure
 * reads of the configured price ids and are unit-tested.
 */

import Stripe from "stripe";
import type { TierId } from "@/lib/tiers";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  _stripe = new Stripe(key);
  return _stripe;
}

/** The configured Stripe price id for a paid tier (null for free/unconfigured). */
export function priceIdForTier(tier: TierId): string | null {
  if (tier === "lite") return process.env.STRIPE_PRICE_LITE ?? null;
  if (tier === "pro") return process.env.STRIPE_PRICE_PRO ?? null;
  return null;
}

/** Reverse mapping for webhook sync; unknown/unset price → free. */
export function tierForPriceId(priceId: string | null | undefined): TierId {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId && priceId === process.env.STRIPE_PRICE_LITE) return "lite";
  return "free";
}
