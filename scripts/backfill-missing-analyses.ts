#!/usr/bin/env tsx
/**
 * scripts/backfill-missing-analyses.ts
 *
 * One-shot backfill for businesses that have a score row for the active issue
 * but no `analyses` row (or an analyses row with an empty themes array). Drives
 * the existing `analyzeOne` pipeline directly against the DB-reconstructed
 * LegacyBusinessFile path, then upserts the analyses row.
 *
 * Cost expectation:
 *   ~$0.02 per business at Sonnet 4.6 pricing (with prompt caching warm).
 *   Hard cap of 35 businesses, ~$0.70 total max.
 *
 * Usage:
 *   npx tsx scripts/backfill-missing-analyses.ts
 *   npx tsx scripts/backfill-missing-analyses.ts --dry-run   (lists slugs, no API)
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import Anthropic from "@anthropic-ai/sdk";
import { and, eq, sql } from "drizzle-orm";

import {
  analyzeOne,
  assembleAnalyzeInput,
  MODEL,
  type AnalyzeInput,
} from "@/scripts/analyze-business";
import { familyForBusinessCategory } from "@/lib/data/category-family";
import type {
  AnalysisPlaybookItem,
  DiagnosisPullquote,
} from "@/lib/data/load-review-analysis";

export const ISSUE_SLUG = "2026-spring";
const HARD_CAP = 35;
const COST_CEILING_USD = 5;
export const RATE_LIMIT_MS = 2000;

/** Per-business cost estimate at Sonnet 4.6 pricing with prompt caching warm. */
export const USD_PER_BUSINESS = 0.02;

// The 4 known businesses with rows but empty themes arrays (per orchestrator).
const EMPTY_THEMES_SLUGS = [
  "sushi-too",
  "global-food-market-llc",
  "dying-breed-tattoo-pgh",
  "piccola-piazza-company",
];

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = vals.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

/**
 * Shape of one row returned by `loadScoredRowsForFamilyContext`. Pulled once
 * per run and passed into `processSlug` so we do not re-query the whole scored
 * set for every business.
 */
export type ScoredRowForContext = {
  slug: string;
  name: string;
  category: string;
  composite: number;
  subscores: {
    content_canvas: number;
    community_spark: number;
    conversion_path: number;
    momentum: number;
    collab_fit: number;
  };
  unfair_advantage: { label: string } | null;
};

/**
 * Pull every scored business for the active issue once. Used to compute
 * family rank, family leader, and peer medians inside `processSlug`. Read-only.
 */
export async function loadScoredRowsForFamilyContext(): Promise<
  ScoredRowForContext[]
> {
  const { db, schema } = await import("@/lib/db/client");
  const rows = await db
    .select({
      slug: schema.businesses.slug,
      name: schema.businesses.name,
      category: schema.businesses.category,
      composite: schema.scores.composite,
      subscores: schema.scores.subscores,
      unfair_advantage: schema.scores.unfair_advantage,
    })
    .from(schema.businesses)
    .innerJoin(
      schema.scores,
      and(
        eq(schema.scores.business_slug, schema.businesses.slug),
        eq(schema.scores.issue_slug, ISSUE_SLUG),
      ),
    );
  return rows as unknown as ScoredRowForContext[];
}

/**
 * Process a single business: load its DB record, signals, reviews, and score,
 * build the family context, call `analyzeOne` (ONE Anthropic API call), and
 * upsert the result into `analyses`. Idempotent on (business_slug, issue_slug):
 * a conflict updates the existing row in place, so re-running is safe and
 * resumable. This makes exactly one paid API call and one DB write per success.
 *
 * Returns "ok" on success, or "skip" with a reason when the business cannot be
 * analyzed (no row, too few reviews, no score). Throws on API/DB errors so the
 * caller can record a failure.
 *
 * SHARED by `backfill-missing-analyses.ts` and `refresh-stale-analyses.ts`.
 * Do not add cost-gate or cap logic here. Callers own their own budgeting.
 */
export async function processSlug(
  client: Anthropic,
  slug: string,
  allScoredRows: ScoredRowForContext[],
): Promise<
  | { status: "ok"; themes: number; playbook: number }
  | { status: "skip"; reason: string }
> {
  const { db, schema } = await import("@/lib/db/client");

  const bizRows = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, slug))
    .limit(1);
  if (bizRows.length === 0) {
    return { status: "skip", reason: "no businesses row" };
  }
  const b = bizRows[0];

  const sigRows = await db
    .select()
    .from(schema.businessSignals)
    .where(
      and(
        eq(schema.businessSignals.business_slug, slug),
        eq(schema.businessSignals.issue_slug, ISSUE_SLUG),
      ),
    )
    .limit(1);
  const sig = sigRows[0] ?? null;

  const reviewRows = await db
    .select()
    .from(schema.businessReviews)
    .where(eq(schema.businessReviews.business_slug, slug));
  const reviews = reviewRows
    .map((r) => r.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  if (reviews.length < 2) {
    return { status: "skip", reason: `only ${reviews.length} reviews on disk` };
  }

  const scoreRows = await db
    .select()
    .from(schema.scores)
    .where(
      and(
        eq(schema.scores.business_slug, slug),
        eq(schema.scores.issue_slug, ISSUE_SLUG),
      ),
    )
    .limit(1);
  if (scoreRows.length === 0) {
    return { status: "skip", reason: "no scores row" };
  }
  const s = scoreRows[0];

  // Family context.
  const fam = familyForBusinessCategory(b.category);
  const sameFamily = allScoredRows.filter(
    (r) => familyForBusinessCategory(r.category).key === fam.key,
  );
  const familyRanked = [...sameFamily].sort((a, b) => b.composite - a.composite);
  const familyRank = familyRanked.findIndex((r) => r.slug === slug) + 1;
  const familyLeaderRow =
    familyRanked.find((r) => r.slug !== slug) ?? familyRanked[0];

  const peerMedians: Record<string, number> = {
    content_canvas: median(sameFamily.map((r) => r.subscores.content_canvas)),
    community_spark: median(sameFamily.map((r) => r.subscores.community_spark)),
    conversion_path: median(sameFamily.map((r) => r.subscores.conversion_path)),
    momentum: median(sameFamily.map((r) => r.subscores.momentum)),
    collab_fit: median(sameFamily.map((r) => r.subscores.collab_fit)),
  };

  const recordForInput = {
    name: b.name,
    neighborhood: b.neighborhood,
    slug: b.slug,
    category: b.category,
    google_review_count: sig?.google_review_count ?? reviews.length,
    review_freshness_days: sig?.review_freshness_days ?? 999,
    _meta: {
      categoryName: sig?.primary_category_name ?? b.category,
      imagesCount: sig?.images_count ?? 0,
      imageCategories: sig?.image_categories ?? [],
      hasWebsite: !!b.website,
      hasPhone: !!sig?.has_phone,
      hasOpeningHours: !!sig?.has_opening_hours,
      reviewsDistribution: sig?.reviews_distribution ?? null,
    },
    _score: {
      tier: s.tier,
      composite: s.composite,
      rank_category: s.ranks?.category ?? 1,
      subscores: s.subscores,
      unfair_advantage: s.unfair_advantage,
    },
  };

  const social = b.instagram
    ? {
        ig: {
          handle: b.instagram.replace(/^@/, ""),
          posts_30d: sig?.posts_last_30 ?? 0,
          reels_30d: sig?.reels_last_30 ?? 0,
          avg_engagement_rate: 0,
          verified: false,
          is_business_account: false,
          biography: "",
          last_post_at: null,
        },
      }
    : {};

  const familyLeader = {
    name: familyLeaderRow.name,
    _score: {
      unfair_advantage: { label: familyLeaderRow.unfair_advantage?.label ?? "" },
    },
  };

  const analyzeInput: AnalyzeInput = assembleAnalyzeInput(
    slug,
    recordForInput as unknown as Parameters<typeof assembleAnalyzeInput>[1],
    social,
    reviews,
    fam,
    familyRank,
    sameFamily.length,
    familyLeader,
    peerMedians,
  );

  const result = await analyzeOne(client, analyzeInput);

  const row = {
    business_slug: slug,
    issue_slug: ISSUE_SLUG,
    themes: result.themes,
    notable_quote: result.notable_quote,
    sentiment_summary: result.sentiment_summary,
    quarter_narrative: result.quarter_narrative ?? null,
    tldr_read: result.tldr_read ?? null,
    tldr_meaning: result.tldr_meaning ?? null,
    diagnosis_pullquote:
      ((result as unknown as { diagnosis_pullquote?: DiagnosisPullquote })
        .diagnosis_pullquote ?? null) as DiagnosisPullquote | null,
    playbook: (result.playbook ?? null) as AnalysisPlaybookItem[] | null,
    review_count: reviews.length,
    model: MODEL,
    prompt_version: null,
    generated_at: new Date(),
  };

  await db
    .insert(schema.analyses)
    .values(row)
    .onConflictDoUpdate({
      target: [schema.analyses.business_slug, schema.analyses.issue_slug],
      set: {
        themes: row.themes,
        notable_quote: row.notable_quote,
        sentiment_summary: row.sentiment_summary,
        quarter_narrative: row.quarter_narrative,
        tldr_read: row.tldr_read,
        tldr_meaning: row.tldr_meaning,
        diagnosis_pullquote: row.diagnosis_pullquote,
        playbook: row.playbook,
        review_count: row.review_count,
        model: row.model,
        prompt_version: row.prompt_version,
        generated_at: row.generated_at,
      },
    });

  return {
    status: "ok",
    themes: result.themes?.length ?? 0,
    playbook: result.playbook?.length ?? 0,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("[backfill] ANTHROPIC_API_KEY not set");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("[backfill] DATABASE_URL not set");
    process.exit(1);
  }

  const { db, schema } = await import("@/lib/db/client");

  // Step 1: find missing slugs (scored but no analyses row).
  const missingRows = await db.execute(sql`
    SELECT s.business_slug AS slug
    FROM ${schema.scores} s
    LEFT JOIN ${schema.analyses} a
      ON a.business_slug = s.business_slug AND a.issue_slug = s.issue_slug
    WHERE s.issue_slug = ${ISSUE_SLUG}
      AND a.business_slug IS NULL
    ORDER BY s.business_slug
  `);
  const missingSlugs: string[] = (missingRows as unknown as { rows: { slug: string }[] }).rows
    ? (missingRows as unknown as { rows: { slug: string }[] }).rows.map((r) => r.slug)
    : (missingRows as unknown as { slug: string }[]).map((r) => r.slug);

  // Step 2: find empty-themes slugs (the 4 known ones; verify they exist).
  const emptyThemesRows = await db.execute(sql`
    SELECT business_slug AS slug
    FROM ${schema.analyses}
    WHERE issue_slug = ${ISSUE_SLUG}
      AND (
        themes IS NULL
        OR jsonb_typeof(themes) != 'array'
        OR jsonb_array_length(themes) = 0
      )
    ORDER BY business_slug
  `);
  const emptyThemesSlugs: string[] = (emptyThemesRows as unknown as { rows: { slug: string }[] }).rows
    ? (emptyThemesRows as unknown as { rows: { slug: string }[] }).rows.map((r) => r.slug)
    : (emptyThemesRows as unknown as { slug: string }[]).map((r) => r.slug);

  // Build the work list: missing + empty themes (deduped).
  const workSet = new Set<string>([...missingSlugs, ...emptyThemesSlugs, ...EMPTY_THEMES_SLUGS]);
  const slugs = Array.from(workSet);

  console.log(`\n[backfill] missing analyses rows: ${missingSlugs.length}`);
  console.log(`[backfill] empty themes rows (queried): ${emptyThemesSlugs.length}`);
  console.log(`[backfill] empty themes (hard-coded): ${EMPTY_THEMES_SLUGS.length}`);
  console.log(`[backfill] total unique slugs to process: ${slugs.length}\n`);

  if (slugs.length === 0) {
    console.log("[backfill] nothing to do. exiting.");
    return;
  }

  if (slugs.length > HARD_CAP) {
    console.error(
      `[backfill] HARD CAP exceeded: ${slugs.length} > ${HARD_CAP}. ` +
        `Refusing to proceed. Investigate why so many businesses are missing.`,
    );
    process.exit(2);
  }

  const estimatedCost = slugs.length * 0.02;
  console.log(`[backfill] estimated cost: ~$${estimatedCost.toFixed(2)} (cap $${COST_CEILING_USD})`);

  if (estimatedCost > COST_CEILING_USD) {
    console.error(`[backfill] estimated cost exceeds ceiling. aborting.`);
    process.exit(3);
  }

  if (dryRun) {
    console.log("\n[backfill] DRY RUN. slugs to process:");
    slugs.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    return;
  }

  // Step 3: pull all scored rows once for family context (rank, leader, peer medians).
  const allScoredRows = await loadScoredRowsForFamilyContext();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let processed = 0;
  let failed = 0;
  const failures: { slug: string; reason: string }[] = [];

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const label = `[${i + 1}/${slugs.length}] ${slug}`;

    try {
      const res = await processSlug(client, slug, allScoredRows);
      if (res.status === "skip") {
        console.log(`${label} ... SKIP (${res.reason})`);
        failures.push({ slug, reason: res.reason });
        failed++;
      } else {
        console.log(
          `${label} ... ok (playbook: ${res.playbook}, themes: ${res.themes})`,
        );
        processed++;
      }
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`${label} ... FAIL: ${msg}`);
      failures.push({ slug, reason: msg.slice(0, 200) });
      failed++;
    }

    if (i < slugs.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Verify.
  const remainRows = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM ${schema.scores} s
    LEFT JOIN ${schema.analyses} a
      ON a.business_slug = s.business_slug AND a.issue_slug = s.issue_slug
    WHERE s.issue_slug = ${ISSUE_SLUG}
      AND a.business_slug IS NULL
  `);
  const remainArr = (remainRows as unknown as { rows?: { n: number }[] }).rows
    ?? (remainRows as unknown as { n: number }[]);
  const remaining = remainArr[0]?.n ?? -1;

  console.log("\n========== BACKFILL SUMMARY ==========");
  console.log(`processed:        ${processed}`);
  console.log(`failed:           ${failed}`);
  console.log(`remaining gaps:   ${remaining}`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    failures.forEach((f) => console.log(`  - ${f.slug}: ${f.reason}`));
  }
  console.log("======================================\n");
}

// Only auto-run when invoked directly (e.g. `tsx backfill-missing-analyses.ts`),
// not when another script imports the exported helpers from this module.
const invokedDirectly =
  !!process.argv[1] &&
  path.resolve(process.argv[1]).includes("backfill-missing-analyses");

if (invokedDirectly) {
  main().catch((e) => {
    console.error("[backfill] fatal:", e);
    process.exit(1);
  });
}
