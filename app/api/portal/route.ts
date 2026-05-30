import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/** Redirect to the Stripe Customer Portal for the signed-in user. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    const self = url.pathname + url.search;
    return Response.redirect(
      new URL(`/signin?callbackUrl=${encodeURIComponent(self)}`, url),
    );
  }

  const [sub] = await getDb()
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    return Response.redirect(new URL("/account", url));
  }

  const portal = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${url.origin}/account`,
  });

  return Response.redirect(portal.url, 303);
}
