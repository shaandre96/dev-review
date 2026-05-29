import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  clientIp,
  enforceReviewLimits,
  MemoryWindow,
  secondsUntilUtcMidnight,
  utcDateKey,
} from "./ratelimit.ts";

describe("clientIp", () => {
  test("uses the first entry of x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    assert.equal(clientIp(h), "1.2.3.4");
  });

  test("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "9.9.9.9" });
    assert.equal(clientIp(h), "9.9.9.9");
  });

  test("returns 'unknown' when no IP header is present", () => {
    assert.equal(clientIp(new Headers()), "unknown");
  });
});

describe("MemoryWindow", () => {
  test("allows up to the limit then blocks within the window", () => {
    const w = new MemoryWindow(2, 1000);
    assert.equal(w.check("ip", 0).ok, true); // 1st
    assert.equal(w.check("ip", 100).ok, true); // 2nd
    assert.equal(w.check("ip", 200).ok, false); // 3rd over limit
  });

  test("resets once the window elapses", () => {
    const w = new MemoryWindow(1, 1000);
    assert.equal(w.check("ip", 0).ok, true);
    assert.equal(w.check("ip", 500).ok, false);
    assert.equal(w.check("ip", 1000).ok, true); // window reset at resetAt
  });

  test("tracks keys independently", () => {
    const w = new MemoryWindow(1, 1000);
    assert.equal(w.check("a", 0).ok, true);
    assert.equal(w.check("b", 0).ok, true);
    assert.equal(w.check("a", 0).ok, false);
  });
});

describe("enforceReviewLimits (in-memory fallback, no Upstash env)", () => {
  test("allows the first request from an IP, blocks the second within the minute", async () => {
    // Unique IP so the module-scoped per-minute window is isolated per test run.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });
    const first = await enforceReviewLimits(headers);
    assert.equal(first.ok, true);

    const second = await enforceReviewLimits(headers);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.code, "rate_limited");
      assert.equal(second.status, 429);
      assert.ok(second.retryAfter > 0);
    }
  });
});

describe("time helpers", () => {
  test("utcDateKey formats as YYYY-MM-DD", () => {
    assert.equal(utcDateKey(Date.UTC(2026, 4, 29, 13, 0, 0)), "2026-05-29");
  });

  test("secondsUntilUtcMidnight is within (0, 86400]", () => {
    const noon = Date.UTC(2026, 4, 29, 12, 0, 0);
    const s = secondsUntilUtcMidnight(noon);
    assert.equal(s, 12 * 60 * 60);
    assert.ok(s > 0 && s <= 86_400);
  });
});
