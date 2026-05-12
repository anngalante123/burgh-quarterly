import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Neon HTTP client for Signal Pittsburgh.
 *
 * Phase 1 of the scale plan moves us off JSON files in `content/` into Neon
 * Postgres. This module is the single point of entry for the DB; every
 * read-side adapter and ingest script imports `db` from here.
 *
 * `DATABASE_URL` is expected to be a Neon connection string (HTTP, pooled).
 * Provisioned via the Vercel Marketplace integration, not by Claude.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Provision Neon via the Vercel Marketplace " +
      "and add the connection string to .env.local. See .env.example.",
  );
}

const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };
