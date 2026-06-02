#!/usr/bin/env tsx
/**
 * scripts/compute-ranks-all.ts
 *
 * Full-DB analog of compute-ranks.ts. Reads every (business, score)
 * row from Neon and writes refreshed rank_category / rank_neighborhood
 * / rank_overall back into the scores.ranks JSONB column.
 *
 * Sort: composite DESC, then google_review_count DESC, then slug ASC
 * (matches the read-time ordering in lib/data/load-business.ts).
 *
 * Usage:
 *   npx tsx scripts/compute-ranks-all.ts --dry-run
 *   npx tsx scripts/compute-ranks-all.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const ISSUE_SLUG = "2026-spring";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { db } = await import("../lib/db/client");
  const schema = await import("../lib/db/schema");
  const { eq, and } = await import("drizzle-orm");

  const rows = await db
    .select()
    .from(schema.businesses)
    .leftJoin(schema.scores, eq(schema.businesses.slug, schema.scores.business_slug))
    .leftJoin(schema.businessSignals, eq(schema.businesses.slug, schema.businessSignals.business_slug));

  type Row = {
    slug: string;
    category: string;
    neighborhood: string | null;
    composite: number;
    review_count: number;
    cur_ranks: { category: number; neighborhood: number; overall: number };
  };

  const records: Row[] = [];
  for (const r of rows) {
    if (!r.scores) continue;
    records.push({
      slug: r.businesses.slug,
      category: r.businesses.category,
      neighborhood: r.businesses.neighborhood ?? null,
      composite: r.scores.composite,
      review_count: (r as unknown as { business_signals?: { google_review_count?: number | null } }).business_signals?.google_review_count ?? 0,
      cur_ranks: (r.scores.ranks as { category: number; neighborhood: number; overall: number }) ?? { category: 0, neighborhood: 0, overall: 0 },
    });
  }

  const cmp = (a: Row, b: Row) =>
    b.composite - a.composite ||
    b.review_count - a.review_count ||
    a.slug.localeCompare(b.slug);

  // overall
  const sortedAll = [...records].sort(cmp);
  const overall = new Map<string, number>();
  sortedAll.forEach((r, i) => overall.set(r.slug, i + 1));

  // per category
  const byCat = new Map<string, Row[]>();
  for (const r of records) {
    const k = r.category;
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(r);
  }
  const cat = new Map<string, number>();
  for (const [, list] of byCat) {
    list.sort(cmp);
    list.forEach((r, i) => cat.set(r.slug, i + 1));
  }

  // per neighborhood
  const byNbhd = new Map<string, Row[]>();
  for (const r of records) {
    const k = r.neighborhood ?? "Pittsburgh";
    if (!byNbhd.has(k)) byNbhd.set(k, []);
    byNbhd.get(k)!.push(r);
  }
  const nbhd = new Map<string, number>();
  for (const [, list] of byNbhd) {
    list.sort(cmp);
    list.forEach((r, i) => nbhd.set(r.slug, i + 1));
  }

  let written = 0;
  let unchanged = 0;
  for (const r of records) {
    const next = {
      category: cat.get(r.slug)!,
      neighborhood: nbhd.get(r.slug)!,
      overall: overall.get(r.slug)!,
    };
    if (
      r.cur_ranks.category === next.category &&
      r.cur_ranks.neighborhood === next.neighborhood &&
      r.cur_ranks.overall === next.overall
    ) {
      unchanged += 1;
      continue;
    }
    if (!dryRun) {
      await db
        .update(schema.scores)
        .set({ ranks: next })
        .where(
          and(
            eq(schema.scores.business_slug, r.slug),
            eq(schema.scores.issue_slug, ISSUE_SLUG),
          ),
        );
    }
    written += 1;
    if (written % 200 === 0) console.log(`[write] ${written}`);
  }

  console.log(`\n[done] ${dryRun ? "would update" : "updated"}: ${written}`);
  console.log(`        unchanged: ${unchanged}`);

  const big = sortedAll[0];
  console.log(`\nNew #1 overall: ${big.slug} (composite ${big.composite})`);
  const restaurants = (byCat.get("restaurant") ?? []).slice(0, 5);
  console.log(`\nTop 5 restaurants:`);
  for (const r of restaurants) {
    console.log(`  ${r.slug.padEnd(45)} composite=${r.composite} reviews=${r.review_count}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
