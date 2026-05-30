/**
 * Database schema (Neon Postgres via Drizzle).
 *
 * The `user` / `account` / `session` / `verificationToken` tables match what
 * `@auth/drizzle-adapter` expects (wired in the auth phase). `subscription`
 * and `usage_event` are DevReview's own: tier/billing state synced from Stripe
 * webhooks, and a per-review audit trail for cost metering.
 */

import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/* ---- Auth.js adapter tables -------------------------------------------- */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/* ---- DevReview billing + usage ----------------------------------------- */

export const tierEnum = pgEnum("tier", ["free", "lite", "pro"]);

// Mirrors Stripe subscription statuses.
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const subscriptions = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  tier: tierEnum("tier").notNull().default("free"),
  status: subscriptionStatusEnum("status"),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Append-only audit of each review's real cost. The live monthly budget
// counter lives in Redis; this is the durable record for reconciliation.
export const usageEvents = pgTable("usage_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").references(() => users.id, { onDelete: "set null" }),
  ip: text("ip"),
  model: text("model").notNull(),
  effort: text("effort").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  credits: integer("credits").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
