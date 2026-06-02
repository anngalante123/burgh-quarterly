#!/usr/bin/env tsx
/**
 * scripts/rescore-all.ts
 *
 * Recompute subscores + composite + tier for every business in the
 * active issue, using the now-populated business_signals data. Phase
 * 7 ingest scored businesses against null/empty signals which inflated
 * composites and miscalled tiers. Pleasant Bar smoke-test showed the
 * recomputed score drops 60 -> 43 (Ones to Watch -> Neighborhood
 * Staple) once real review counts and ratings are in play.
 *
 * Pass 2 of tonight's refresh: scripts/reanalyze-all.ts re-runs the
 * Claude editorial layer after this script writes fresh ranks.
 *
 * Idempotent. Preserves the existing `ranks` JSONB (those are
 * recomputed on a separate pass). Preserves `unfair_advantage` and
 * `movement` (those come from the analyze layer, untouched here).
 *
 * Usage:
 *   npx tsx scripts/rescore-all.ts --dry-run
 *   npx tsx scripts/rescore-all.ts                # commits
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import { eq, and } from "drizzle-orm";

import {
  scoreSubscores,
  composite as computeComposite,
  tierOf,
  type IgSnapshot,
} from "@/lib/scoring/score";
import type { Business } from "@/lib/data/schemas";
import { loadSocialBySlug } from "@/lib/data/load-social";

type DbModule = typeof import("@/lib/db/client");
let _dbMod: DbModule | null = null;
async function getDb(): Promise<DbModule> {
  if (_dbMod) return _dbMod;
  _dbMod = await import("@/lib/db/client");
  return _dbMod;
}

const ISSUE_SLUG = "2026-spring";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`[rescore-all] mode=${dryRun ? "dry-run" : "commit"} issue=${ISSUE_SLUG}`);

  const { db, schema } = await getDb();

  // Pull every business + its signals + photos + keyword counts +
  // review texts. Review texts feed communitySparkScore's affection
  // sentiment leg; without them the whole index gets flat-30 sentiment.
  const [businessRows, signalsRows, photoRows, keywordRows, reviewRows, scoreRows] =
    await Promise.all([
      db.select().from(schema.businesses),
      db
        .select()
        .from(schema.businessSignals)
        .where(eq(schema.businessSignals.issue_slug, ISSUE_SLUG)),
      db.select().from(schema.businessPhotos),
      db.select().from(schema.businessReviewKeywords),
      db
        .select({
          business_slug: schema.businessReviews.business_slug,
          text: schema.businessReviews.text,
        })
        .from(schema.businessReviews),
      db
        .select()
        .from(schema.scores)
        .where(eq(schema.scores.issue_slug, ISSUE_SLUG)),
    ]);

  const signalsBySlug = new Map(signalsRows.map((r) => [r.business_slug, r]));
  const photoCountBySlug = new Map<string, number>();
  for (const p of photoRows) {
    photoCountBySlug.set(p.business_slug, (photoCountBySlug.get(p.business_slug) ?? 0) + 1);
  }
  const keywordsBySlug = new Map<string, string[]>();
  for (const k of keywordRows) {
    const arr = keywordsBySlug.get(k.business_slug) ?? [];
    arr.push(k.keyword);
    keywordsBySlug.set(k.business_slug, arr);
  }
  const reviewTextsBySlug = new Map<string, string[]>();
  for (const r of reviewRows) {
    if (!r.text) continue;
    const arr = reviewTextsBySlug.get(r.business_slug) ?? [];
    arr.push(r.text);
    reviewTextsBySlug.set(r.business_slug, arr);
  }
  const scoreRowBySlug = new Map(scoreRows.map((r) => [r.business_slug, r]));

  console.log(`[scan] ${businessRows.length} businesses, ${signalsRows.length} signal rows`);

  let written = 0;
  let unchanged = 0;
  let skippedNoScoreRow = 0;
  const tierShifts: Record<string, number> = {};

  for (const b of businessRows) {
    const sig = signalsBySlug.get(b.slug) ?? null;

    // Build the typed Business object scoring expects.
    const business: Business = {
      slug: b.slug,
      name: b.name,
      category: b.category,
      neighborhood: b.neighborhood,
      address: b.address,
      website: b.website ?? undefined,
      instagram: b.instagram ?? undefined,
      tiktok: b.tiktok ?? undefined,
      google_rating: sig?.google_rating ?? undefined,
      google_review_count: sig?.google_review_count ?? undefined,
      review_freshness_days: sig?.review_freshness_days ?? undefined,
      posts_last_30: sig?.posts_last_30 ?? undefined,
      reels_last_30: sig?.reels_last_30 ?? undefined,
      has_booking_link: sig?.has_booking_link ?? undefined,
      has_ugc_visible: sig?.has_ugc_visible ?? undefined,
      photos: [],
      review_keywords: keywordsBySlug.get(b.slug) ?? [],
      created_at: (b.created_at ?? new Date()).toISOString(),
      updated_at: (b.updated_at ?? new Date()).toISOString(),
      claimed: b.claimed ?? false,
    };

    const meta = {
      placeId: b.place_id ?? "",
      categoryName: sig?.primary_category_name ?? "",
      imagesCount: sig?.images_count ?? photoCountBySlug.get(b.slug) ?? 0,
      imageCategories: sig?.image_categories ?? [],
      fromTheBusinessFlags: sig?.from_the_business_flags ?? [],
      hasWebsite: !!b.website,
      hasPhone: sig?.has_phone ?? false,
      hasOpeningHours: sig?.has_opening_hours ?? false,
      phone: null,
      claimThisBusiness: sig?.claim_this_business ?? null,
      reviewsDistribution: sig?.reviews_distribution
        ? {
            oneStar: sig.reviews_distribution.oneStar ?? 0,
            twoStar: sig.reviews_distribution.twoStar ?? 0,
            threeStar: sig.reviews_distribution.threeStar ?? 0,
            fourStar: sig.reviews_distribution.fourStar ?? 0,
            fiveStar: sig.reviews_distribution.fiveStar ?? 0,
          }
        : null,
      rawReviewsCount: sig?.google_review_count ?? 0,
      reviewTexts: reviewTextsBySlug.get(b.slug) ?? [],
      keywordPhrases: (keywordsBySlug.get(b.slug) ?? []).map((kw) => ({
        text: kw,
        count: 0,
        exampleQuote: "",
      })),
    };

    // Load IG snapshot from content/social/<slug>.json (populated by
    // scripts/scrape-ig-profiles-batched.ts). When ig is null (no handle
    // discovered or scrape errored), composite() drops the momentum
    // weight and rebalances the remaining four signals.
    const ig = loadSocialBySlug(b.slug).ig as IgSnapshot | null;

    const subs = scoreSubscores(business, meta, ig);
    const comp = computeComposite(subs, { skipMomentum: !ig });
    const tier = tierOf(comp);

    const cur = scoreRowBySlug.get(b.slug);
    if (!cur) {
      skippedNoScoreRow += 1;
      continue;
    }

    // Skip the write only when composite, tier, AND every subscore is
    // already at the recomputed value. Otherwise write so the stored
    // subscores stay in sync with what the score function produces today.
    const subsUnchanged =
      cur.subscores.content_canvas === subs.content_canvas &&
      cur.subscores.community_spark === subs.community_spark &&
      cur.subscores.conversion_path === subs.conversion_path &&
      cur.subscores.momentum === subs.momentum &&
      cur.subscores.collab_fit === subs.collab_fit;
    if (cur.composite === comp && cur.tier === tier && subsUnchanged) {
      unchanged += 1;
      continue;
    }

    if (cur.tier !== tier) {
      const key = `${cur.tier} -> ${tier}`;
      tierShifts[key] = (tierShifts[key] ?? 0) + 1;
    }

    if (!dryRun) {
      await db
        .update(schema.scores)
        .set({
          subscores: subs,
          composite: comp,
          tier,
          scored_at: new Date(),
        })
        .where(
          and(
            eq(schema.scores.business_slug, b.slug),
            eq(schema.scores.issue_slug, ISSUE_SLUG),
          ),
        );
    }
    written += 1;
    if (written % 200 === 0) {
      console.log(`[write] ${written}`);
    }
  }

  console.log(`\n[done] ${dryRun ? "would update" : "updated"}: ${written}`);
  console.log(`        unchanged: ${unchanged}`);
  console.log(`        no-score-row: ${skippedNoScoreRow}`);
  console.log(`\nTier shifts:`);
  for (const [k, v] of Object.entries(tierShifts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
