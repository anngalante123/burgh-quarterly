#!/usr/bin/env tsx
/**
 * scripts/backfill-signals.ts
 *
 * One-time backfill for business_signals across the 1,992 Phase 7 batch
 * ingests that never had a signals row written. Reads every Apify raw
 * dump in content/raw/apify/, indexes by placeId, joins to businesses by
 * place_id, and upserts a row per (slug, issue) with the rich meta the
 * page rendering depends on (rating, review count, image count, image
 * categories, reviews distribution, "from the business" flags, etc.).
 *
 * Usage:
 *   npx tsx scripts/backfill-signals.ts            # commit
 *   npx tsx scripts/backfill-signals.ts --dry-run  # report only, no writes
 *
 * Idempotent: re-runs safely. Original 30 calibration rows already in
 * business_signals are upserted (existing values overwrite to keep the
 * source of truth uniform across the index).
 */
import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

// Deferred import: lib/db/client throws at module load if DATABASE_URL is
// missing, so we need dotenv to run first.
type DbModule = typeof import("@/lib/db/client");
let _dbMod: DbModule | null = null;
async function getDb(): Promise<DbModule> {
  if (_dbMod) return _dbMod;
  _dbMod = await import("@/lib/db/client");
  return _dbMod;
}

type ApifyRecord = {
  placeId?: string;
  totalScore?: number;
  reviewsCount?: number;
  imagesCount?: number;
  imageCategories?: string[];
  categoryName?: string;
  website?: string | null;
  phone?: string | null;
  phoneUnformatted?: string | null;
  openingHours?: unknown[] | null;
  claimThisBusiness?: boolean | null;
  reviewsDistribution?: {
    oneStar?: number;
    twoStar?: number;
    threeStar?: number;
    fourStar?: number;
    fiveStar?: number;
  } | null;
  additionalInfo?: Record<string, Array<Record<string, boolean>>> | null;
  scrapedAt?: string;
};

const RAW_DIR = path.join(process.cwd(), "content", "raw", "apify");
const ISSUE_SLUG = "2026-spring";

function parseFromTheBusiness(rec: ApifyRecord): string[] {
  const ai = rec.additionalInfo;
  if (!ai) return [];
  const block = ai["From the business"];
  if (!Array.isArray(block)) return [];
  const flags: string[] = [];
  for (const entry of block) {
    if (!entry || typeof entry !== "object") continue;
    for (const [k, v] of Object.entries(entry)) {
      if (v === true) flags.push(k);
    }
  }
  return flags;
}

function reviewFreshnessDaysFromScrapedAt(scrapedAt?: string): number | null {
  if (!scrapedAt) return null;
  const t = Date.parse(scrapedAt);
  if (Number.isNaN(t)) return null;
  const days = Math.round((Date.now() - t) / 86_400_000);
  return days < 0 ? 0 : days;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(
    `[backfill-signals] mode=${dryRun ? "dry-run" : "commit"} issue=${ISSUE_SLUG}`,
  );

  // Index every Apify record by placeId. Last-write-wins across files,
  // so the most recent scrape of a duplicate place_id wins. Files are
  // sorted by name so the timestamp suffix orders them naturally.
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const byPlaceId = new Map<string, ApifyRecord>();
  let scannedRecords = 0;
  for (const f of files) {
    const full = path.join(RAW_DIR, f);
    let arr: ApifyRecord[];
    try {
      const txt = fs.readFileSync(full, "utf8");
      arr = JSON.parse(txt) as ApifyRecord[];
    } catch (e) {
      console.warn(`[skip] ${f}: ${(e as Error).message.slice(0, 100)}`);
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      scannedRecords += 1;
      if (r.placeId) byPlaceId.set(r.placeId, r);
    }
  }
  console.log(
    `[scan] ${files.length} files, ${scannedRecords} records, ${byPlaceId.size} unique placeIds`,
  );

  // Pull every business with a place_id. We will join on place_id and
  // upsert a signals row per slug.
  const { db, schema } = await getDb();
  const bizRows = await db
    .select({ slug: schema.businesses.slug, place_id: schema.businesses.place_id })
    .from(schema.businesses);
  const targets = bizRows.filter((b) => b.place_id && byPlaceId.has(b.place_id));
  const orphans = bizRows.filter((b) => !b.place_id || !byPlaceId.has(b.place_id ?? ""));
  console.log(
    `[match] ${targets.length} of ${bizRows.length} businesses matched a placeId in raw dumps (${orphans.length} have no match)`,
  );

  let written = 0;
  let skipped = 0;
  for (const t of targets) {
    const rec = byPlaceId.get(t.place_id!)!;
    const flags = parseFromTheBusiness(rec);
    const row = {
      business_slug: t.slug,
      issue_slug: ISSUE_SLUG,
      google_rating: typeof rec.totalScore === "number" ? rec.totalScore : null,
      google_review_count:
        typeof rec.reviewsCount === "number" ? rec.reviewsCount : null,
      review_freshness_days: reviewFreshnessDaysFromScrapedAt(rec.scrapedAt),
      posts_last_30: null,
      reels_last_30: null,
      has_booking_link: null,
      has_ugc_visible: null,
      primary_category_name: rec.categoryName ?? null,
      images_count: typeof rec.imagesCount === "number" ? rec.imagesCount : null,
      image_categories:
        Array.isArray(rec.imageCategories) && rec.imageCategories.length > 0
          ? rec.imageCategories
          : null,
      from_the_business_flags: flags.length > 0 ? flags : null,
      has_phone: !!(rec.phone || rec.phoneUnformatted),
      has_opening_hours: Array.isArray(rec.openingHours) && rec.openingHours.length > 0,
      claim_this_business:
        typeof rec.claimThisBusiness === "boolean" ? rec.claimThisBusiness : null,
      reviews_distribution: rec.reviewsDistribution ?? null,
    };

    if (dryRun) {
      skipped += 1;
      if (skipped <= 3) {
        console.log(
          `[dry] ${t.slug}: rating=${row.google_rating} reviews=${row.google_review_count} images=${row.images_count} category="${row.primary_category_name}"`,
        );
      }
      continue;
    }

    await db
      .insert(schema.businessSignals)
      .values(row)
      .onConflictDoUpdate({
        target: [
          schema.businessSignals.business_slug,
          schema.businessSignals.issue_slug,
        ],
        set: {
          google_rating: row.google_rating,
          google_review_count: row.google_review_count,
          review_freshness_days: row.review_freshness_days,
          primary_category_name: row.primary_category_name,
          images_count: row.images_count,
          image_categories: row.image_categories,
          from_the_business_flags: row.from_the_business_flags,
          has_phone: row.has_phone,
          has_opening_hours: row.has_opening_hours,
          claim_this_business: row.claim_this_business,
          reviews_distribution: row.reviews_distribution,
        },
      });
    written += 1;
    if (written % 200 === 0) {
      console.log(`[write] ${written}/${targets.length}`);
    }
  }

  console.log(
    dryRun
      ? `[done] dry-run, would have written ${targets.length} rows`
      : `[done] wrote ${written} rows; orphans (no placeId match in raw dumps): ${orphans.length}`,
  );
  if (orphans.length > 0 && !dryRun) {
    console.log("[orphans] first 10:");
    for (const o of orphans.slice(0, 10)) console.log("  ", o.slug, o.place_id ?? "(no place_id)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
