import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env.local on its own; load it so DATABASE_URL is
// available to db:migrate / db:studio. No-op if the file is absent (e.g. CI,
// where DATABASE_URL comes from the ambient environment).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* .env.local not present — rely on the ambient environment */
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Required for `db:migrate`/`db:studio`; not needed for `db:generate`.
    url: process.env.DATABASE_URL ?? "",
  },
});
