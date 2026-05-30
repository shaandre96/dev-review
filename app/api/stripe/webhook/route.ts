import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, schema } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { stripe, tierForPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook. Source of truth for subscription state: on every
 * subscription event we re-derive the user's tier/status from the live Stripe
 * object and write it to the `subscription` row matched by Stripe customer id
 * (created during checkout).
 *
 * Idempotent: each event.id is claimed in Redis with a 7-day TTL before
 * processing, so Stripe redeliveries are no-ops. Falls back to an in-memory
 * Set when Redis isn't configured (dev only — per-instance).
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return new Response("Webhook not configured.", { status: 400 });
  }

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  if (!(await claimEvent(event.id))) {
    // Already processed — Stripe redelivery or duplicate. Acknowledge.
    return new Response(null, { status: 200 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await applySubscription(event.data.object);
  }

  return new Response(null, { status: 200 });
}

const SEEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const memSeen = new Set<string>();

/** Returns true if this is the first time we're seeing the event, false if dup. */
async function claimEvent(eventId: string): Promise<boolean> {
  const r = getRedis();
  if (r) {
    const result = await r.set(`stripe:event:${eventId}`, "1", {
      nx: true,
      ex: SEEN_TTL_SECONDS,
    });
    return result === "OK";
  }
  if (memSeen.has(eventId)) return false;
  memSeen.add(eventId);
  // Best-effort bound; prevents unbounded growth in long-lived dev processes.
  if (memSeen.size > 10_000) memSeen.clear();
  return true;
}

async function applySubscription(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const item = sub.items.data[0];
  const priceId = item?.price.id;
  const isActive = sub.status === "active" || sub.status === "trialing";
  const tier = isActive ? tierForPriceId(priceId) : "free";

  // current_period_end lives on the subscription item in current API versions,
  // with the subscription-level field kept for older ones.
  const periodEnd =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000) : null;

  await getDb()
    .update(schema.subscriptions)
    .set({
      tier,
      status: sub.status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.stripeCustomerId, customerId));
}
