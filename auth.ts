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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [GitHub, Google],
});
