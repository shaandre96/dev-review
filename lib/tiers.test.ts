import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  actualReviewCostUsd,
  estimateReviewCostUsd,
  isModelAllowed,
  monthlyCredits,
  netRevenueUsd,
  resolveEffort,
  TIERS,
  tierFromSubscription,
} from "./tiers.ts";

describe("review cost", () => {
  test("actual cost matches the rate card", () => {
    // Opus 4.7: $5/M in, $25/M out. 3k in + 8k out.
    const cost = actualReviewCostUsd("claude-opus-4-7", 3000, 8000);
    assert.equal(cost, (3000 * 5 + 8000 * 25) / 1_000_000); // $0.215
  });

  test("estimate orders Haiku < Sonnet < Opus at the same effort", () => {
    const h = estimateReviewCostUsd("claude-haiku-4-5", "high");
    const s = estimateReviewCostUsd("claude-sonnet-4-6", "high");
    const o = estimateReviewCostUsd("claude-opus-4-7", "high");
    assert.ok(h < s && s < o);
  });

  test("higher effort costs more for the same model", () => {
    const med = estimateReviewCostUsd("claude-opus-4-7", "medium");
    const xhigh = estimateReviewCostUsd("claude-opus-4-7", "xhigh");
    assert.ok(xhigh > med);
  });
});

describe("tier entitlements", () => {
  test("free is Haiku-only, no effort choice", () => {
    assert.equal(isModelAllowed(TIERS.free, "claude-haiku-4-5"), true);
    assert.equal(isModelAllowed(TIERS.free, "claude-opus-4-7"), false);
    assert.equal(resolveEffort(TIERS.free, "xhigh"), "medium"); // request ignored
  });

  test("lite adds Sonnet but not Opus", () => {
    assert.equal(isModelAllowed(TIERS.lite, "claude-sonnet-4-6"), true);
    assert.equal(isModelAllowed(TIERS.lite, "claude-opus-4-7"), false);
  });

  test("pro allows Opus and honours an effort choice", () => {
    assert.equal(isModelAllowed(TIERS.pro, "claude-opus-4-7"), true);
    assert.equal(resolveEffort(TIERS.pro, "xhigh"), "xhigh");
  });
});

describe("unit economics", () => {
  // A fully-consumed monthly budget must still leave margin after Stripe fees.
  for (const id of ["lite", "pro"] as const) {
    test(`${id} budget stays under net revenue`, () => {
      const tier = TIERS[id];
      const net = netRevenueUsd(tier.priceUsdMonthly);
      assert.ok(
        tier.monthlyBudgetUsd < net,
        `${id}: budget $${tier.monthlyBudgetUsd} should be < net $${net.toFixed(2)}`,
      );
      // Keep a healthy margin: cost allowance under ~55% of net.
      assert.ok(tier.monthlyBudgetUsd < net * 0.55);
    });
  }

  test("credit conversion is consistent with the budget", () => {
    assert.equal(monthlyCredits(TIERS.lite), 40_000); // $4
    assert.equal(monthlyCredits(TIERS.pro), 120_000); // $12
  });
});

describe("tierFromSubscription", () => {
  const future = new Date("2026-07-01");
  const now = new Date("2026-05-29");

  test("no subscription → free", () => {
    assert.equal(tierFromSubscription(null, now), "free");
  });

  test("active subscription within period → its tier", () => {
    assert.equal(
      tierFromSubscription(
        { tier: "pro", status: "active", currentPeriodEnd: future },
        now,
      ),
      "pro",
    );
  });

  test("trialing counts as active", () => {
    assert.equal(
      tierFromSubscription(
        { tier: "lite", status: "trialing", currentPeriodEnd: future },
        now,
      ),
      "lite",
    );
  });

  test("canceled or past_due → free", () => {
    assert.equal(
      tierFromSubscription(
        { tier: "pro", status: "canceled", currentPeriodEnd: future },
        now,
      ),
      "free",
    );
  });

  test("active but lapsed period → free", () => {
    assert.equal(
      tierFromSubscription(
        {
          tier: "pro",
          status: "active",
          currentPeriodEnd: new Date("2026-05-01"),
        },
        now,
      ),
      "free",
    );
  });
});
