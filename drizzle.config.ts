import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Required for `db:migrate`/`db:studio`; not needed for `db:generate`.
    url: process.env.DATABASE_URL ?? "",
  },
});
