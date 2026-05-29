/**
 * Usage metering for signed-in users.
 *
 * The live monthly credit counter lives in Upstash Redis (keyed per user per
 * UTC month); `usage_event` rows in Postgres are the durable audit. Credits are
 * cost-based (see lib/tiers.ts), so a paid plan's monthly allowance can be spent
 * across any model the tier permits.
 *
 * Anonymous (free) reviews are NOT metered here — they're bounded by the IP
 * rate limits + global daily cap in lib/ratelimit.ts and never touch the DB.
 */

import { Redis } from "@upstash/redis";
import { getDb, schema } from "@/lib/db";
import {
  actualReviewCostUsd,
  type Effort,
  type ModelId,
  usdToCredits,
} from "@/lib/tiers";

function utcMonthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

function creditsKey(userId: string): string {
  return `credits:${userId}:${utcMonthKey()}`;
}

let _redis: Redis | null = null;
let _checked = false;
function redis(): Redis | null {
  if (_checked) return _redis;
  _checked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

// Per-instance fallback when Redis isn't configured (dev only).
const memCredits = new Map<string, number>();

export async function creditsUsedThisMonth(userId: string): Promise<number> {
  const r = redis();
  if (r) return (await r.get<number>(creditsKey(userId))) ?? 0;
  return memCredits.get(creditsKey(userId)) ?? 0;
}

export async function addCreditsUsed(
  userId: string,
  credits: number,
): Promise<void> {
  if (credits <= 0) return;
  const key = creditsKey(userId);
  const r = redis();
  if (r) {
    const total = await r.incrby(key, credits);
    if (total === credits) await r.expire(key, 60 * 60 * 24 * 35); // ~35d
    return;
  }
  memCredits.set(key, (memCredits.get(key) ?? 0) + credits);
}

/** Record one review's real cost; returns the credits charged. */
export async function recordUsageEvent(e: {
  userId: string;
  model: ModelId;
  effort: Effort;
  inputTokens: number;
  outputTokens: number;
}): Promise<{ costUsd: number; credits: number }> {
  const costUsd = actualReviewCostUsd(e.model, e.inputTokens, e.outputTokens);
  const credits = usdToCredits(costUsd);
  await getDb().insert(schema.usageEvents).values({
    userId: e.userId,
    model: e.model,
    effort: e.effort,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    costUsd,
    credits,
  });
  return { costUsd, credits };
}
