#!/usr/bin/env tsx
/**
 * Ingest 30 Pittsburgh businesses — the Spring 2026 issue manifest.
 *
 * Reads:
 *   - content/raw/apify/pit-dts-foodniche-v2.json   (29 of 30)
 *   - content/raw/apify/la-gourmandine-raw.json     (1 pilot w/ review text)
 *
 * Filter (minimum quality bar):
 *   - !temporarilyClosed && !permanentlyClosed
 *   - totalScore >= 4.5
 *   - reviewsCount >= 100
 *   - imagesCount >= 20
 *   - (reviews || []).filter(r => r.text).length >= 2
 *
 * Distribution (30 total):
 *   10 bakeries/cafes/coffee shops (MUST include La Gourmandine Lawrenceville)
 *    8 restaurants
 *    6 dessert / ice cream / specialty
 *    4 breweries / bars
 *    2 other standouts (juice, tea, etc.)
 *
 * At least 4 distinct neighborhoods represented.
 *
 * Writes:
 *   - content/businesses/<slug>.json   (Business schema + _meta scoring data + _score)
 *
 * Validation: each record round-trips through Zod — any failure aborts the run.
 *
 * Run with: npm run ingest30   (or: npx tsx scripts/ingest-30.ts)
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { BusinessSchema } from "../lib/data/schemas";
import {
  normalizeApifyRecordWithMeta,
  resetDedupeState,
  type NormalizedArtifact,
} from "../lib/data/normalize";
import { scoreBusiness } from "../lib/scoring/score";

const PROJECT_ROOT = resolve(__dirname, "..");
const FOODNICHE_V2 = join(
  PROJECT_ROOT,
  "content",
  "raw",
  "apify",
  "pit-dts-foodniche-v2.json",
);
const PILOT_PATH = join(
  PROJECT_ROOT,
  "content",
  "raw",
  "apify",
  "la-gourmandine-raw.json",
);
const OUT_DIR = join(PROJECT_ROOT, "content", "businesses");
const ISSUE_SLUG = "2026-spring";

/* ---------------------- qualifying filter ------------------------------- */

interface RawApifyLike {
  title?: string;
  placeId?: string;
  categoryName?: string;
  neighborhood?: string | null;
  totalScore?: number;
  reviewsCount?: number;
  imagesCount?: number;
  temporarilyClosed?: boolean;
  permanentlyClosed?: boolean;
  reviews?: { text?: string | null }[] | null;
}

function qualifies(rec: RawApifyLike): boolean {
  if (rec.temporarilyClosed === true) return false;
  if (rec.permanentlyClosed === true) return false;
  if ((rec.totalScore ?? 0) < 4.5) return false;
  if ((rec.reviewsCount ?? 0) < 100) return false;
  if ((rec.imagesCount ?? 0) < 20) return false;
  const textReviews =
    (rec.reviews ?? []).filter((r) =>
      typeof r?.text === "string" && r.text.trim().length > 0
    );
  if (textReviews.length < 2) return false;
  return true;
}

/* ---------------------- distribution selection -------------------------- */

/**
 * The 29 businesses we pick from pit-dts-foodniche-v2.json, keyed by
 * exact title for stable selection. La Gourmandine Lawrenceville (the
 * 30th) comes from the pilot file.
 *
 * Selected by hand from the qualifying pool to hit:
 *   - category distribution (bakeries/cafes/coffee + restaurants + dessert
 *     + breweries/bars + other)
 *   - neighborhood spread (Lawrenceville, Shadyside, Strip District,
 *     Bloomfield, East Liberty, Squirrel Hill N/S, Highland Park, etc.)
 */
const V2_PICKS: string[] = [
  // ----- Bakeries / cafes / coffee (9 — La Gourmandine Lville is the 10th, pilot) -----
  "The Butterwood Bake Consortium", // Lawrenceville · Cafe
  "La Gourmandine Hazelwood", // Hazelwood · Pastry shop (cafe-adjacent)
  "Tazza D'Oro", // Highland Park · Cafe
  "Allegheny Coffee & Tea Exchange", // Strip District · Coffee shop
  "Margaux", // East Liberty · Coffee shop
  "Ka-Fair Coffee and Cakery", // Morningside · Cafe
  "MeetCha", // Squirrel Hill South · Cafe
  "Spot of Coffee", // Shadyside · Coffee shop
  "Delanie's Coffee Shadyside", // Shadyside · Coffee shop

  // ----- Restaurants (8) -----
  "Reva Modern Indian Cuisine", // East Liberty · Indian
  "Lorelei", // East Liberty · Restaurant
  "Pusadee's Garden", // Lawrenceville · Thai
  "Mola", // East Liberty · Sushi
  "Nan Xiang Soup Dumplings - Pittsburgh", // South Side Flats
  "Square Cafe", // East Liberty · Brunch restaurant
  "Oishii Donburi", // Lawrenceville · Japanese
  "Everyday Noodles", // Squirrel Hill North · Noodle shop

  // ----- Dessert / ice cream / specialty (6) -----
  "Page's", // Arlington · Dessert shop
  "Millie's Homemade Ice Cream", // Shadyside · Ice cream
  "Jeni's Splendid Ice Creams", // Larimer · Ice cream
  "Treat - Ice Cream and Liege Waffles", // Shadyside · Ice cream
  "Kyo Matcha", // Squirrel Hill South · Dessert shop
  "Waffallonia", // Squirrel Hill South · Dessert restaurant

  // ----- Breweries / bars (4) -----
  "Hop Farm Brewing Company", // Lawrenceville · Brewery
  "Golden Age Beer Company", // unknown neighborhood · Brewery
  "Hidden Harbor", // Squirrel Hill South · Bar
  "Commerce Bar", // East Liberty · Bar

  // ----- Other standouts (2) -----
  "24 Carrot Juice", // Bloomfield · Juice shop
  "Dobrá Tea Pittsburgh", // Squirrel Hill South · Tea house
];

/**
 * Title-based selection for Millie's (two in dataset, we want Shadyside's).
 */
function pickMilliesShadyside(rec: RawApifyLike): boolean {
  return (
    rec.title === "Millie's Homemade Ice Cream" && rec.neighborhood === "Shadyside"
  );
}

/* ---------------------- helpers ----------------------------------------- */

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function pickSelected(
  pool: RawApifyLike[],
  wantedTitles: string[],
): RawApifyLike[] {
  const seen = new Set<string>(); // placeIds
  const out: RawApifyLike[] = [];
  const wantedSet = new Set(wantedTitles);

  // First pass: Millie's Shadyside (two-of-same-name disambiguation).
  for (const rec of pool) {
    if (!rec.placeId) continue;
    if (pickMilliesShadyside(rec) && wantedSet.has(rec.title!) &&
      !seen.has(rec.placeId)) {
      out.push(rec);
      seen.add(rec.placeId);
    }
  }

  // Second pass: everything else by title.
  for (const rec of pool) {
    if (!rec.placeId) continue;
    if (seen.has(rec.placeId)) continue;
    if (rec.title && wantedSet.has(rec.title)) {
      // Skip Millie's that isn't Shadyside (already handled).
      if (rec.title === "Millie's Homemade Ice Cream" &&
        rec.neighborhood !== "Shadyside") {
        continue;
      }
      out.push(rec);
      seen.add(rec.placeId);
    }
  }

  return out;
}

/* ---------------------- main ------------------------------------------- */

async function main(): Promise<void> {
  if (!existsSync(FOODNICHE_V2)) {
    console.error(`[ingest30] missing source: ${FOODNICHE_V2}`);
    process.exit(1);
  }
  if (!existsSync(PILOT_PATH)) {
    console.error(`[ingest30] missing pilot: ${PILOT_PATH}`);
    process.exit(1);
  }

  const rawV2 = JSON.parse(await readFile(FOODNICHE_V2, "utf8")) as RawApifyLike[];
  const pilot = JSON.parse(await readFile(PILOT_PATH, "utf8")) as RawApifyLike;

  const qualifyingV2 = rawV2.filter(qualifies);
  console.log(
    `[ingest30] v2 source has ${rawV2.length} records, ${qualifyingV2.length} pass filter`,
  );

  // Select 29 from v2 by title.
  const picks = pickSelected(qualifyingV2, V2_PICKS);
  const missing = V2_PICKS.filter((t) => {
    // "Millie's Homemade Ice Cream" counts only if Shadyside one was found.
    if (t === "Millie's Homemade Ice Cream") {
      return !picks.some(pickMilliesShadyside);
    }
    return !picks.some((p) => p.title === t);
  });
  if (missing.length > 0) {
    console.error(
      `[ingest30] FATAL: could not locate ${missing.length} picks in source:\n  - ` +
        missing.join("\n  - "),
    );
    process.exit(2);
  }

  // La Gourmandine Lawrenceville from pilot file. It has review text (unique).
  if (!qualifies(pilot)) {
    console.error(
      `[ingest30] FATAL: pilot record ${pilot.title} fails minimum quality filter`,
    );
    process.exit(2);
  }

  const allRecords = [pilot, ...picks];
  console.log(`[ingest30] selected ${allRecords.length} records to ingest`);

  await ensureDir(OUT_DIR);
  resetDedupeState();

  let written = 0;
  let failed = 0;

  // Track distribution stats for report.
  const catCounts: Record<string, number> = {};
  const hoodCounts: Record<string, number> = {};

  const normalized: NormalizedArtifact[] = [];

  for (const rec of allRecords) {
    const art = normalizeApifyRecordWithMeta(rec);
    if (!art) {
      console.error(
        `[ingest30] FAILED to normalize: ${rec.title} (${rec.placeId})`,
      );
      failed += 1;
      continue;
    }

    // Strict schema validation (belt-and-suspenders).
    const parsed = BusinessSchema.safeParse(art.business);
    if (!parsed.success) {
      console.error(
        `[ingest30] Zod validation FAILED for ${art.business.slug}: ${
          parsed.error.message.slice(0, 240)
        }`,
      );
      failed += 1;
      continue;
    }

    // Compute the score NOW — rank will be filled in by compute-ranks.ts.
    const scored = scoreBusiness(art.business, art.meta);

    // Provisional score — rank fields are placeholders until compute-ranks
    // runs. We validate a minimum shape here; full Score validation lives in
    // compute-ranks.ts once ranks are known.
    const provisionalScore = {
      business_slug: art.business.slug,
      issue_slug: ISSUE_SLUG,
      subscores: scored.subscores,
      composite: scored.composite,
      tier: scored.tier,
      momentum_source: scored.momentum_source,
    };

    // Serialized artifact: Business + _meta (scoring inputs) + _score (partial).
    const artifact = {
      ...art.business,
      _meta: {
        placeId: art.meta.placeId,
        categoryName: art.meta.categoryName,
        imagesCount: art.meta.imagesCount,
        imageCategories: art.meta.imageCategories,
        fromTheBusinessFlags: art.meta.fromTheBusinessFlags,
        hasWebsite: art.meta.hasWebsite,
        hasPhone: art.meta.hasPhone,
        phone: art.meta.phone,
        hasOpeningHours: art.meta.hasOpeningHours,
        claimThisBusiness: art.meta.claimThisBusiness,
        reviewsDistribution: art.meta.reviewsDistribution,
        rawReviewsCount: art.meta.rawReviewsCount,
        reviewTexts: art.meta.reviewTexts,
        keywordPhrases: art.meta.keywordPhrases,
      },
      _score: provisionalScore,
    };

    const outFile = join(OUT_DIR, `${art.business.slug}.json`);
    await writeJson(outFile, artifact);

    catCounts[art.meta.categoryName] = (catCounts[art.meta.categoryName] ?? 0) +
      1;
    hoodCounts[art.business.neighborhood] =
      (hoodCounts[art.business.neighborhood] ?? 0) + 1;
    normalized.push(art);
    written += 1;
  }

  // Summary
  console.log(`\n[ingest30] wrote ${written}, failed ${failed}`);
  console.log("\n[ingest30] categories:");
  for (const [c, n] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${c}`);
  }
  console.log("\n[ingest30] neighborhoods:");
  for (const [h, n] of Object.entries(hoodCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n.toString().padStart(3)}  ${h}`);
  }

  // Ensure we wrote exactly 30.
  if (written !== 30) {
    console.error(`[ingest30] FATAL: expected 30 records, wrote ${written}`);
    process.exit(3);
  }

  // `normalized` is kept around for future cross-record validation work.
  void normalized;

  console.log(
    "\n[ingest30] done. Next step: `npx tsx scripts/compute-ranks.ts`.",
  );
}

main().catch((err) => {
  console.error("[ingest30] fatal:", err);
  process.exit(1);
});
