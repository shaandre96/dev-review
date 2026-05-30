/**
 * Lazily-initialised shared Upstash Redis client.
 *
 * Returns null when UPSTASH_REDIS_REST_URL/TOKEN aren't configured — each
 * caller (rate limiting, usage metering, webhook dedup) decides what to do
 * when there's no shared store (typically: fall back to an in-memory map and
 * log a one-time dev warning).
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _checked = false;

export function getRedis(): Redis | null {
  if (_checked) return _redis;
  _checked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) _redis = new Redis({ url, token });
  return _redis;
}
