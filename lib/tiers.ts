/**
 * Pricing model + tier definitions for DevReview (approved 2026-05-29).
 *
 * Pure and dependency-free so the cost math is unit-testable under `node --test`.
 * This is the single source of truth that later work (DB tier column, /api/review
 * entitlement checks, pricing cards) will import.
 *
 * Cost-aware credits: because users pick the model + effort, a flat "N reviews"
 * quota doesn't work (Opus output is 5x Sonnet, 5x Haiku). Each review deducts
 * credits equal to its real cost. We pre-estimate conservatively to gate the
 * call, then reconcile against the actual token usage the API returns.
 */

export type ModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7";
export type Effort = "low" | "medium" | "high" | "xhigh";
export type TierId = "free" | "lite" | "pro";

/** Anthropic list price in USD per 1M tokens (May 2026). */
export const MODEL_PRICING: Record<
  ModelId,
  { label: string; inputPerM: number; outputPerM: number }
> = {
  "claude-haiku-4-5": { label: "Haiku 4.5", inputPerM: 1, outputPerM: 5 },
  "claude-sonnet-4-6": { label: "Sonnet 4.6", inputPerM: 3, outputPerM: 15 },
  "claude-opus-4-7": { label: "Opus 4.7", inputPerM: 5, outputPerM: 25 },
};

/**
 * Rough output-token budget per effort level (review content + reasoning).
 * Used ONLY for the pre-flight estimate; the real deduction uses actual usage.
 */
export const EFFORT_OUTPUT_TOKENS: Record<Effort, number> = {
  low: 1500,
  medium: 3500,
  high: 8000,
  xhigh: 15000,
};

/** Opus 4.7's tokenizer can emit ~35% more tokens — pad its estimates. */
const TOKENIZER_PAD: Record<ModelId, number> = {
  "claude-haiku-4-5": 1,
  "claude-sonnet-4-6": 1,
  "claude-opus-4-7": 1.35,
};

/** 1 credit = $0.0001 of model cost (10,000 credits = $1). */
export const CREDITS_PER_USD = 10_000;

export function usdToCredits(usd: number): number {
  return Math.ceil(usd * CREDITS_PER_USD);
}

/** Conservative pre-flight cost estimate (USD) for one review. */
export function estimateReviewCostUsd(
  model: ModelId,
  effort: Effort,
  inputTokens = 3000,
): number {
  const p = MODEL_PRICING[model];
  const pad = TOKENIZER_PAD[model];
  const inTok = inputTokens * pad;
  const outTok = EFFORT_OUTPUT_TOKENS[effort] * pad;
  return (inTok * p.inputPerM + outTok * p.outputPerM) / 1_000_000;
}

/** Exact cost (USD) from the real token usage the API reports. */
export function actualReviewCostUsd(
  model: ModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = MODEL_PRICING[model];
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

export interface Tier {
  id: TierId;
  label: string;
  priceUsdMonthly: number; // 0 for free
  requiresAuth: boolean;
  allowedModels: ModelId[];
  defaultEffort: Effort;
  effortChoice: boolean; // may the user change effort?
  /** Monthly model-cost allowance (USD). 0 = governed by the global daily cap. */
  monthlyBudgetUsd: number;
  perMinute: number;
  /** Per-day request cap; 0 = the credit budget governs instead. */
  perDay: number;
}

export const TIERS: Record<TierId, Tier> = {
  free: {
    id: "free",
    label: "Free",
    priceUsdMonthly: 0,
    requiresAuth: false,
    allowedModels: ["claude-haiku-4-5"],
    defaultEffort: "medium",
    effortChoice: false,
    monthlyBudgetUsd: 0, // bounded by the anonymous global daily cap
    perMinute: 1,
    perDay: 5,
  },
  lite: {
    id: "lite",
    label: "Lite",
    priceUsdMonthly: 9,
    requiresAuth: true,
    allowedModels: ["claude-haiku-4-5", "claude-sonnet-4-6"],
    defaultEffort: "high",
    effortChoice: false,
    monthlyBudgetUsd: 4,
    perMinute: 5,
    perDay: 0,
  },
  pro: {
    id: "pro",
    label: "Pro",
    priceUsdMonthly: 29,
    requiresAuth: true,
    allowedModels: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
    defaultEffort: "high",
    effortChoice: true,
    monthlyBudgetUsd: 12,
    perMinute: 10,
    perDay: 0,
  },
};

export function monthlyCredits(tier: Tier): number {
  return usdToCredits(tier.monthlyBudgetUsd);
}

export function isModelAllowed(tier: Tier, model: ModelId): boolean {
  return tier.allowedModels.includes(model);
}

export function resolveEffort(tier: Tier, requested?: Effort): Effort {
  if (tier.effortChoice && requested) return requested;
  return tier.defaultEffort;
}

export type SubscriptionSnapshot = {
  tier: TierId;
  status: string | null;
  currentPeriodEnd: Date | null;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

/**
 * Effective tier from a subscription row. Free unless there is an active (or
 * trialing) subscription whose period hasn't lapsed — so cancelled, past-due,
 * or expired users fall back to the free tier.
 */
export function tierFromSubscription(
  sub: SubscriptionSnapshot | null | undefined,
  now: Date = new Date(),
): TierId {
  if (!sub || !ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status ?? "")) {
    return "free";
  }
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) {
    return "free";
  }
  return sub.tier;
}

/** Stripe standard fee for a one-off/subscription charge (USD). */
export function stripeFeeUsd(priceUsd: number): number {
  return priceUsd * 0.029 + 0.3;
}

/** Net revenue after Stripe fees (USD). */
export function netRevenueUsd(priceUsd: number): number {
  return priceUsd - stripeFeeUsd(priceUsd);
}
