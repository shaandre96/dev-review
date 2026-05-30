/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Google + GitHub OAuth, persisted to Neon via the Drizzle adapter using
 * database-backed sessions (a session row + cookie, looked up per request).
 * Provider credentials are read from the AUTH_GITHUB_ID/SECRET and
 * AUTH_GOOGLE_ID/SECRET env vars by Auth.js convention; AUTH_SECRET signs the
 * session cookie.
 *
 * Tier/billing state lives in the `subscription` table (synced from Stripe in
 * a later phase); a signed-in user with no active subscription is treated as
 * the free tier.
 */

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { getDb, schema } from "@/lib/db";
import { getUserTier } from "@/lib/entitlements";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [GitHub, Google],
  pages: { signIn: "/signin" },
  callbacks: {
    // Expose the user id + effective tier on the session. Tier is read from the
    // subscription table here and refreshed whenever the session is validated.
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.tier = await getUserTier(user.id);
      }
      return session;
    },
  },
});
