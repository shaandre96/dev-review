/**
 * Drizzle client backed by Neon over HTTP — well suited to Vercel's
 * serverless request model. `DATABASE_URL` is required at runtime wherever the
 * db is used (auth, billing, metering); it is read lazily so importing this
 * module never throws during a build that doesn't touch the database.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — cannot connect to the database.",
    );
  }
  _db = drizzle(neon(url), { schema });
  return _db;
}

export { schema };
