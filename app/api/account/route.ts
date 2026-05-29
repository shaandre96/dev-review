import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Permanently delete the signed-in user's account. Deleting the user row
 * cascades to their accounts, sessions, and subscription; usage rows have
 * their userId nulled (retained, anonymised, for cost reconciliation).
 *
 * TODO(billing phase): cancel the Stripe subscription before deleting.
 */
export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  await getDb().delete(schema.users).where(eq(schema.users.id, userId));
  return new Response(null, { status: 204 });
}
