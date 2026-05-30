import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { priceIdForTier, stripe, tierForPriceId } from "@/lib/stripe";
import type { TierId } from "@/lib/tiers";

export const runtime = "nodejs";

/**
 * Switch the signed-in user's active subscription to another paid tier.
 * After Stripe returns, we eagerly mirror the new tier into our `subscription`
 * row so the UI updates without waiting on the webhook (the webhook still
 * fires and is idempotent).
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { to?: string };
  try {
    body = (await req.json()) as { to?: string };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }

  const to = body.to as TierId | undefined;
  if (to !== "lite" && to !== "pro") {
    return Response.json({ error: "bad_tier" }, { status: 400 });
  }

  const newPrice = priceIdForTier(to);
  if (!newPrice) {
    return Response.json({ error: "billing_unavailable" }, { status: 503 });
  }

  const db = getDb();
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeSubscriptionId) {
    return Response.json({ error: "no_subscription" }, { status: 400 });
  }

  const current = await stripe().subscriptions.retrieve(
    sub.stripeSubscriptionId,
  );
  const item = current.items.data[0];
  if (!item) {
    return Response.json({ error: "no_subscription_item" }, { status: 400 });
  }
  if (item.price.id === newPrice) {
    return Response.json({ error: "already_on_plan" }, { status: 400 });
  }

  const updated = await stripe().subscriptions.update(
    sub.stripeSubscriptionId,
    {
      items: [{ id: item.id, price: newPrice }],
      proration_behavior: "create_prorations",
    },
  );

  await db
    .update(schema.subscriptions)
    .set({
      tier: tierForPriceId(updated.items.data[0]?.price.id),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptions.userId, userId));

  return new Response(null, { status: 204 });
}
