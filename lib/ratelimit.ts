/**
 * Rate limiting + a global daily spend cap for /api/review.
 *
 * Two layers protect the Anthropic bill:
 *  - Per-IP limits (default 1/min and 5/day) stop a single client spamming.
 *  - A global daily cap (DAILY_REVIEW_CAP) is the wallet protector: once the
 *    whole app has admitted that many reviews in a UTC day, further requests
 *    are refused WITHOUT calling Anthropic. This is what bounds cost even if
 *    an abuser rotates IPs. The hard guarantee is still the monthly spend
 *    limit set in the Anthropic Console — this just smooths usage under it.
 *
 * Counters live in Upstash Redis so they are shared across Vercel's serverless
 * instances. If Upstash isn't configured (e.g. local dev), we fall back to an
 * in-memory limiter that is per-instance and therefore NOT enforceable in
 * production — a warning is logged so this can't be mistaken for real coverage.
 *
 * Keep this module dependency-light and free of parameter properties so the
 * pure helpers (clientIp, MemoryWindow, time helpers) run under `node --test`.
 */

import { Redis } from "@upstash/redis";

const PER_MINUTE = toPositiveInt(process.env.RATE_LIMIT_PER_MINUTE, 1);
const PER_DAY = toPositiveInt(process.env.RATE_LIMIT_PER_DAY, 5);
const DAILY_CAP = toPositiveInt(process.env.DAILY_REVIEW_CAP, 20);

export type RateDecision =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: "rate_limited" | "daily_capacity_reached";
      message: string;
      retryAfter: number;
    };

/** Extract the client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** UTC calendar-day key, e.g. "2026-05-29". */
export function utcDateKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Seconds remaining until the next UTC midnight (>= 1). */
export function secondsUntilUtcMidnight(now = Date.now()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now) / 1000));
}

/**
 * In-memory fixed-window counter. Used only as a dev/unconfigured fallback.
 * `now` is injected so the window logic is deterministic in tests.
 */
export class MemoryWindow {
  limit: number;
  windowMs: number;
  hits: Map<string, { count: number; resetAt: number }>;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Record a hit for `key`; returns whether it is within the limit. */
  check(key: string, now: number): { ok: boolean; remaining: number } {
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true, remaining: this.limit - 1 };
    }
    if (entry.count >= this.limit) return { ok: false, remaining: 0 };
    entry.count += 1;
    return { ok: true, remaining: this.limit - entry.count };
  }
}

let _redis: Redis | null = null;
let _warned = false;
function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _redis = new Redis({ url, token });
    return _redis;
  }
  return null;
}

// Per-instance fallback windows (only used when Redis is absent).
const memMinute = new MemoryWindow(PER_MINUTE, 60_000);
const memDay = new MemoryWindow(PER_DAY, 86_400_000);
const memGlobal = new MemoryWindow(DAILY_CAP, 86_400_000);

/** Fixed-window hit against Redis: INCR, and set the TTL on first hit. */
async function redisHit(
  r: Redis,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, ttlSeconds);
  return count;
}

function tooMany(retryAfter: number): RateDecision {
  return {
    ok: false,
    status: 429,
    code: "rate_limited",
    message: `Rate limit reached (${PER_MINUTE}/min, ${PER_DAY}/day). Try again in ${retryAfter}s.`,
    retryAfter,
  };
}

function atCapacity(): RateDecision {
  const retryAfter = secondsUntilUtcMidnight();
  return {
    ok: false,
    status: 503,
    code: "daily_capacity_reached",
    message:
      "The free daily review capacity has been reached. Please try again tomorrow.",
    retryAfter,
  };
}

/**
 * Enforce per-IP limits and the global daily cap for one review request.
 * Each admitted request consumes a slot in all three counters.
 */
export async function enforceReviewLimits(
  headers: Headers,
): Promise<RateDecision> {
  const ip = clientIp(headers);
  const r = redis();

  if (r) {
    const day = utcDateKey();
    if ((await redisHit(r, `rl:min:${ip}`, 60)) > PER_MINUTE) {
      return tooMany(60);
    }
    if (
      (await redisHit(r, `rl:day:${day}:${ip}`, secondsUntilUtcMidnight())) >
      PER_DAY
    ) {
      return tooMany(secondsUntilUtcMidnight());
    }
    if (
      (await redisHit(r, `rl:global:${day}`, secondsUntilUtcMidnight())) >
      DAILY_CAP
    ) {
      return atCapacity();
    }
    return { ok: true };
  }

  if (!_warned) {
    console.warn(
      "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory fallback. " +
        "Limits are per-instance and NOT enforced across deployments. Do not rely on this in production.",
    );
    _warned = true;
  }

  const now = Date.now();
  if (!memMinute.check(ip, now).ok) return tooMany(60);
  if (!memDay.check(ip, now).ok) return tooMany(secondsUntilUtcMidnight(now));
  if (!memGlobal.check("global", now).ok) return atCapacity();
  return { ok: true };
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
