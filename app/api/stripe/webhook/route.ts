import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb, schema } from "@/lib/db";
import { stripe, tierForPriceId } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook. Source of truth for subscription state: on every
 * subscription event we re-derive the user's tier/status from the live Stripe
 * object and write it to the `subscription` row matched by Stripe customer id
 * (created during checkout).
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

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await applySubscription(event.data.object);
  }

  return new Response(null, { status: 200 });
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
