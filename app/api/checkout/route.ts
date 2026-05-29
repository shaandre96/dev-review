import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { priceIdForTier, stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Start a Stripe Checkout session for a paid tier and redirect to it.
 * Requires a signed-in user; ensures a Stripe customer + subscription row
 * exists first. Reached by navigation (not prefetched).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.redirect(new URL("/signin", url));
  }

  const tier = url.searchParams.get("tier");
  if (tier !== "lite" && tier !== "pro") {
    return Response.redirect(new URL("/?error=bad_tier#pricing", url));
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    return Response.redirect(
      new URL("/?error=billing_unavailable#pricing", url),
    );
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: session.user.email ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    if (existing) {
      await db
        .update(schema.subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(schema.subscriptions.userId, userId));
    } else {
      await db
        .insert(schema.subscriptions)
        .values({ userId, stripeCustomerId: customerId });
    }
  }

  const checkout = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    success_url: `${url.origin}/account?status=subscribed`,
    cancel_url: `${url.origin}/?status=cancelled#pricing`,
  });

  return Response.redirect(
    checkout.url ?? `${url.origin}/?error=checkout#pricing`,
    303,
  );
}
