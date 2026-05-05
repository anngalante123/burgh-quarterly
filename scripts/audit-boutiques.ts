#!/usr/bin/env tsx
/**
 * scripts/audit-boutiques.ts
 *
 * Two audits in one pass, both read-only:
 *
 *   1. Boutique audit: list every business currently labeled `boutique`
 *      with its ORIGINAL Apify primary `categoryName` (pulled from the
 *      _meta JSON on disk in content/businesses/). Output is raw, not
 *      auto-corrected, so the orchestrator can spot mislabels.
 *
 *   2. Chain sweep: run isChain() against every business name in the
 *      DB and surface any matches. Does NOT delete; just reports.
 *
 * Run via:
 *   node --env-file=.env.local --import tsx scripts/audit-boutiques.ts
 *
 * Or:
 *   npx tsx scripts/audit-boutiques.ts   (with DATABASE_URL exported)
 */

import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import { eq } from "drizzle-orm";
import { db, schema } from "../lib/db/client";
import { isChain } from "../lib/data/chain-detection";

const BUSINESSES_DIR = path.join(process.cwd(), "content", "businesses");

interface LegacyMeta {
  placeId?: string;
  categoryName?: string;
}

function readMetaFromDisk(slug: string): LegacyMeta | null {
  const file = path.join(BUSINESSES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    const meta = raw._meta;
    if (meta && typeof meta === "object") return meta as LegacyMeta;
    return null;
  } catch {
    return null;
  }
}

async function auditBoutiques(): Promise<void> {
  console.log("=== Boutique audit ===");
  const rows = await db
    .select({
      slug: schema.businesses.slug,
      name: schema.businesses.name,
      neighborhood: schema.businesses.neighborhood,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.category, "boutique"))
    .orderBy(schema.businesses.slug);

  console.log(`Found ${rows.length} boutique row(s).\n`);
  for (const row of rows) {
    const meta = readMetaFromDisk(row.slug);
    const primary = meta?.categoryName ?? "(no _meta on disk)";
    console.log(`[${row.slug}] ${row.name} -- primary: ${primary}`);
  }
  console.log("");
}

async function chainSweep(): Promise<void> {
  console.log("=== Chain detection sweep ===");
  const rows = await db
    .select({
      slug: schema.businesses.slug,
      name: schema.businesses.name,
      category: schema.businesses.category,
    })
    .from(schema.businesses)
    .orderBy(schema.businesses.slug);

  const flagged: { slug: string; name: string; category: string }[] = [];
  for (const row of rows) {
    if (isChain({ name: row.name })) {
      flagged.push({ slug: row.slug, name: row.name, category: row.category });
    }
  }
  console.log(
    `Scanned ${rows.length} business(es). Flagged ${flagged.length} as chain matches.\n`,
  );
  for (const f of flagged) {
    console.log(`[${f.slug}] (${f.category}) ${f.name}`);
  }
  console.log("");
}

async function main(): Promise<void> {
  await auditBoutiques();
  await chainSweep();
}

main().catch((e) => {
  console.error("audit-boutiques failed:", (e as Error).message);
  process.exit(1);
});
