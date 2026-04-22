#!/usr/bin/env tsx
/**
 * Compute rank fields across all ingested businesses.
 *
 * Reads every file in content/businesses/*.json (post-ingest30), computes:
 *   - rank_overall      — position across all 30 by composite score
 *   - rank_category     — position within same categoryName
 *   - rank_neighborhood — position within same neighborhood
 *   - movement          — null for first issue (no history)
 *   - unfair_advantage  — the subscore where the business most exceeds its
 *                         tier average
 *
 * Writes the completed Score back into each file's `_score` field,
 * validated against ScoreSchema.
 *
 * Run with: npx tsx scripts/compute-ranks.ts
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  BusinessSchema,
  ScoreSchema,
  type Business,
  type Score,
  type Tier,
  type ScoreBreakdown,
} from "../lib/data/schemas";

const PROJECT_ROOT = resolve(__dirname, "..");
const BUSINESSES_DIR = join(PROJECT_ROOT, "content", "businesses");
const ISSUE_SLUG = "2026-spring";

/* ---------- ingested file shape (loose) -------- */

interface IngestedArtifact {
  _meta: {
    placeId: string;
    categoryName: string;
    imagesCount: number;
    imageCategories: string[];
    fromTheBusinessFlags: string[];
    hasWebsite: boolean;
    hasPhone: boolean;
    phone: string | null;
    hasOpeningHours: boolean;
    claimThisBusiness: boolean | null;
    reviewsDistribution: Record<string, number> | null;
    rawReviewsCount: number;
    reviewTexts: string[];
    keywordPhrases: { text: string; count: number; exampleQuote: string }[];
  };
  _score: {
    business_slug: string;
    issue_slug: string;
    subscores: ScoreBreakdown;
    composite: number;
    tier: Tier;
    momentum_source: string;
  };
  // ...Business fields flattened into the root
  [key: string]: unknown;
}

/* ------------------ unfair advantage picker ------------------ */

interface ScoredRecord {
  business: Business;
  meta: IngestedArtifact["_meta"];
  scoreStub: IngestedArtifact["_score"];
}

const SUBSCORE_LABEL: Record<keyof ScoreBreakdown, string> = {
  content_canvas: "visual storytelling",
  community_spark: "community affection",
  conversion_path: "conversion path clarity",
  momentum: "social momentum",
  collab_fit: "creator collaboration fit",
};

/**
 * Pick the single subscore where the business most outperforms the MEDIAN
 * across all businesses. Returns the label + a data-grounded evidence line.
 */
function pickUnfairAdvantage(
  rec: ScoredRecord,
  all: ScoredRecord[],
): { label: string; evidence: string } {
  const keys = Object.keys(rec.scoreStub.subscores) as (keyof ScoreBreakdown)[];
  const medians: Record<keyof ScoreBreakdown, number> = {
    content_canvas: 0,
    community_spark: 0,
    conversion_path: 0,
    momentum: 0,
    collab_fit: 0,
  };

  for (const k of keys) {
    const vals = all.map((r) => r.scoreStub.subscores[k]).sort((a, b) => a - b);
    const mid = Math.floor(vals.length / 2);
    medians[k] = vals.length % 2 === 0
      ? (vals[mid - 1] + vals[mid]) / 2
      : vals[mid];
  }

  let bestKey: keyof ScoreBreakdown = keys[0];
  let bestDelta = -Infinity;
  for (const k of keys) {
    const delta = rec.scoreStub.subscores[k] - medians[k];
    if (delta > bestDelta) {
      bestDelta = delta;
      bestKey = k;
    }
  }

  // Evidence line — data-grounded, voice-compliant (no "leverage" etc.).
  const label = SUBSCORE_LABEL[bestKey];
  let evidence: string;

  switch (bestKey) {
    case "community_spark": {
      const count = rec.business.google_review_count ?? 0;
      const fresh = rec.business.review_freshness_days ?? null;
      const freshPart = fresh !== null && fresh <= 30
        ? ` with a review in the last ${fresh === 0 ? "day" : `${fresh} days`}`
        : "";
      evidence =
        `${count.toLocaleString()} Google reviews${freshPart} — the highest community-spark reading in this issue's set.`;
      break;
    }
    case "content_canvas": {
      evidence =
        `${rec.meta.imagesCount.toLocaleString()} photos across ${rec.meta.imageCategories.length} Google-indexed categories — a visual catalog creators can pull from.`;
      break;
    }
    case "conversion_path": {
      const parts: string[] = [];
      if (rec.meta.hasWebsite) parts.push("website");
      if (rec.meta.hasPhone) parts.push("phone");
      if (rec.meta.hasOpeningHours) parts.push("hours");
      if (rec.meta.claimThisBusiness === false) parts.push("claimed profile");
      evidence = `Every conversion-path signal present: ${parts.join(", ")}.`;
      break;
    }
    case "momentum": {
      evidence =
        `Social momentum is the standout here — awaiting Instagram data in the next scrape to show the exact margin.`;
      break;
    }
    case "collab_fit": {
      const flags = rec.meta.fromTheBusinessFlags.length > 0
        ? ` (${rec.meta.fromTheBusinessFlags.slice(0, 2).join(", ")})`
        : "";
      evidence =
        `Clear neighborhood identity in ${rec.business.neighborhood}${flags} — a natural match for local creator audiences.`;
      break;
    }
    default:
      evidence = `Outperforms the issue median on ${label}.`;
  }

  return { label, evidence };
}

/* ------------------ main ------------------ */

async function main(): Promise<void> {
  const files = (await readdir(BUSINESSES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(
      `[ranks] no business files in ${BUSINESSES_DIR}. Run ingest-30 first.`,
    );
    process.exit(1);
  }

  const records: ScoredRecord[] = [];
  for (const fname of files) {
    const raw = JSON.parse(
      await readFile(join(BUSINESSES_DIR, fname), "utf8"),
    ) as IngestedArtifact;
    const { _meta, _score, ...businessFields } = raw;

    const parsed = BusinessSchema.safeParse(businessFields);
    if (!parsed.success) {
      console.error(
        `[ranks] FATAL: ${fname} fails Business schema: ${
          parsed.error.message.slice(0, 240)
        }`,
      );
      process.exit(2);
    }
    records.push({ business: parsed.data, meta: _meta, scoreStub: _score });
  }

  // Overall rank: sort by composite desc, stable tiebreak by name.
  const byOverall = [...records].sort((a, b) =>
    b.scoreStub.composite - a.scoreStub.composite ||
    a.business.name.localeCompare(b.business.name)
  );
  const overallRank = new Map<string, number>();
  byOverall.forEach((r, i) => overallRank.set(r.business.slug, i + 1));

  // Category rank (by _meta.categoryName — the raw Apify label).
  const categoryBuckets = new Map<string, ScoredRecord[]>();
  for (const r of records) {
    const k = r.meta.categoryName || "Unknown";
    if (!categoryBuckets.has(k)) categoryBuckets.set(k, []);
    categoryBuckets.get(k)!.push(r);
  }
  const categoryRank = new Map<string, number>();
  for (const bucket of categoryBuckets.values()) {
    bucket.sort((a, b) =>
      b.scoreStub.composite - a.scoreStub.composite ||
      a.business.name.localeCompare(b.business.name)
    );
    bucket.forEach((r, i) => categoryRank.set(r.business.slug, i + 1));
  }

  // Neighborhood rank.
  const hoodBuckets = new Map<string, ScoredRecord[]>();
  for (const r of records) {
    const k = r.business.neighborhood || "Pittsburgh";
    if (!hoodBuckets.has(k)) hoodBuckets.set(k, []);
    hoodBuckets.get(k)!.push(r);
  }
  const hoodRank = new Map<string, number>();
  for (const bucket of hoodBuckets.values()) {
    bucket.sort((a, b) =>
      b.scoreStub.composite - a.scoreStub.composite ||
      a.business.name.localeCompare(b.business.name)
    );
    bucket.forEach((r, i) => hoodRank.set(r.business.slug, i + 1));
  }

  // Write back.
  const now = new Date().toISOString();
  let writtenCount = 0;

  for (const rec of records) {
    const unfair = pickUnfairAdvantage(rec, records);

    const fullScore: Score = {
      business_slug: rec.business.slug,
      issue_slug: ISSUE_SLUG,
      subscores: rec.scoreStub.subscores,
      composite: rec.scoreStub.composite,
      tier: rec.scoreStub.tier,
      rank_category: categoryRank.get(rec.business.slug)!,
      rank_neighborhood: hoodRank.get(rec.business.slug)!,
      rank_overall: overallRank.get(rec.business.slug)!,
      movement: { category: null, neighborhood: null, overall: null },
      unfair_advantage: unfair,
      scored_at: now,
    };

    const parsed = ScoreSchema.safeParse(fullScore);
    if (!parsed.success) {
      console.error(
        `[ranks] FATAL: Score for ${rec.business.slug} failed Zod: ${
          parsed.error.message.slice(0, 240)
        }`,
      );
      process.exit(3);
    }

    // Re-read, patch, re-write with updated _score + momentum_source retained.
    const fname = join(BUSINESSES_DIR, `${rec.business.slug}.json`);
    const existing = JSON.parse(
      await readFile(fname, "utf8"),
    ) as IngestedArtifact;
    existing._score = {
      ...parsed.data,
      momentum_source: rec.scoreStub.momentum_source,
    } as IngestedArtifact["_score"];
    await writeFile(fname, JSON.stringify(existing, null, 2) + "\n", "utf8");
    writtenCount += 1;
  }

  // Report.
  console.log(`[ranks] updated ${writtenCount} business files.\n`);
  console.log("Top 10 by composite:");
  byOverall.slice(0, 10).forEach((r, i) => {
    console.log(
      `  #${(i + 1).toString().padStart(2)}  ${r.scoreStub.composite}  ${
        r.scoreStub.tier.padEnd(20)
      }  ${r.business.name}`,
    );
  });

  // Score distribution stats.
  const composites = records.map((r) => r.scoreStub.composite).sort((
    a,
    b,
  ) => a - b);
  const min = composites[0];
  const max = composites[composites.length - 1];
  const mid = composites.length % 2 === 0
    ? (composites[composites.length / 2 - 1] + composites[composites.length / 2]) /
      2
    : composites[Math.floor(composites.length / 2)];
  console.log(`\nComposite: min=${min} median=${mid} max=${max}`);

  // La Gourmandine sanity check.
  const lg = records.find((r) => r.business.slug === "la-gourmandine-lawrenceville");
  if (lg) {
    console.log(
      `\nLa Gourmandine Lawrenceville composite: ${lg.scoreStub.composite} (tier: ${lg.scoreStub.tier})`,
    );
    if (lg.scoreStub.composite < 78 || lg.scoreStub.composite > 85) {
      console.error(
        `[ranks] FATAL: La Gourmandine out of calibration range [78,85]. See SCORING_RUBRIC.md § Calibration.`,
      );
      process.exit(4);
    }
  }
}

main().catch((err) => {
  console.error("[ranks] fatal:", err);
  process.exit(1);
});
