import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Permanently delete the signed-in user's account.
 *
 * Order of operations matters: we tear down Stripe first, then the local user.
 * Deleting the Stripe customer cancels any active subscription (so we stop
 * billing immediately) and removes the user's data from Stripe in one call —
 * if it fails for a real reason we abort *before* removing the local row so
 * the user can retry cleanly.
 *
 * The local delete cascades to accounts/sessions/subscription; usage rows
 * have their userId nulled (retained, anonymised, for cost reconciliation).
 */
export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const [sub] = await db
    .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  if (sub?.stripeCustomerId) {
    try {
      await stripe().customers.del(sub.stripeCustomerId);
    } catch (err) {
      if (!isAlreadyGone(err)) {
        // Stop here so the local row remains and the user can retry. Surface
        // a specific code so the UI can suggest a contact path.
        return Response.json(
          {
            error: "billing_cleanup_failed",
            message:
              "We couldn't reach Stripe to cancel your subscription. Your account hasn't been deleted — try again in a moment, and contact us if it keeps failing.",
          },
          { status: 502 },
        );
      }
    }
  }

  try {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  } catch {
    return Response.json(
      {
        error: "delete_failed",
        message:
          "We couldn't finish deleting your account. Try again in a moment, and contact us if it keeps failing.",
      },
      { status: 500 },
    );
  }
  return new Response(null, { status: 204 });
}

function isAlreadyGone(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { statusCode?: number; code?: string };
  return e.statusCode === 404 || e.code === "resource_missing";
}
