import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { priceIdForTier, tierForPriceId } from "./stripe.ts";

describe("price <-> tier mapping", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.STRIPE_PRICE_LITE = "price_lite_123";
    process.env.STRIPE_PRICE_PRO = "price_pro_456";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  test("priceIdForTier returns the configured id (null for free)", () => {
    assert.equal(priceIdForTier("lite"), "price_lite_123");
    assert.equal(priceIdForTier("pro"), "price_pro_456");
    assert.equal(priceIdForTier("free"), null);
  });

  test("tierForPriceId reverses it; unknown/undefined → free", () => {
    assert.equal(tierForPriceId("price_pro_456"), "pro");
    assert.equal(tierForPriceId("price_lite_123"), "lite");
    assert.equal(tierForPriceId("price_unknown"), "free");
    assert.equal(tierForPriceId(undefined), "free");
    assert.equal(tierForPriceId(null), "free");
  });
});
