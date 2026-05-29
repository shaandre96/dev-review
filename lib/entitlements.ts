/**
 * Server-side tier resolution. Reads the user's subscription from the DB and
 * maps it to an effective tier via the pure `tierFromSubscription` in tiers.ts
 * (free for signed-in users with no active subscription).
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { type TierId, tierFromSubscription } from "@/lib/tiers";

export async function getUserTier(userId: string): Promise<TierId> {
  const db = getDb();
  const [sub] = await db
    .select({
      tier: schema.subscriptions.tier,
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return tierFromSubscription(sub ?? null);
}
