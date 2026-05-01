import type { Config } from "drizzle-kit";

/**
 * Drizzle Kit config for Burgh Quarterly.
 *
 * `dialect: "postgresql"` covers Neon. The `driver: "pg-http"` setting wires
 * drizzle-kit to talk to Neon's HTTP endpoint when running migrations or
 * studio. Migrations land in `lib/db/migrations/`.
 */

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
