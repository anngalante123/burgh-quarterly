#!/usr/bin/env tsx
/**
 * backup-analyses.ts, dump the entire `analyses` table to a timestamped
 * JSON file under scripts/backups/. Run this BEFORE any refresh that
 * regenerates analyses (scripts/refresh-stale-analyses.ts --execute), so
 * the Claude-generated narrative can be restored if a refresh goes wrong.
 *
 * Read-only. Spends nothing. Writes one local file.
 *
 * Usage:
 *   npx tsx scripts/backup-analyses.ts
 */
import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

async function main() {
  const { db, schema } = await import("@/lib/db/client");
  const rows = await db.select().from(schema.analyses);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 19);
  const dir = path.join(process.cwd(), "scripts", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `analyses-snapshot-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`[backup-analyses] wrote ${rows.length} rows to ${out}`);
}

main().then(() => process.exit(0));
