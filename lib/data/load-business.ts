import fs from "node:fs";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  analyses as analysesTable,
  businesses as businessesTable,
  businessPhotos as businessPhotosTable,
  businessReviewKeywords as businessReviewKeywordsTable,
  businessSignals as businessSignalsTable,
  issues as issuesTable,
  scores as scoresTable,
  underratedLists as underratedListsTable,
} from "@/lib/db/schema";
import {
  BusinessSchema,
  ScoreSchema,
  UnderratedListSchema,
  type Business,
  type Category,
  type Issue,
  type Score,
  type Tier,
  type UnderratedList,
} from "./schemas";
import type { ReviewAnalysis } from "./load-review-analysis";

/**
 * Database-backed read adapter for the Burgh Quarterly content layer.
 *
 * Phase 1 of the scale plan moves reads off `content/*.json` and onto Neon
 * Postgres via Drizzle. The JSON files remain on disk as legacy fallback for
 * one ancillary payload (`BusinessArtifact.meta`, the Apify scraper detail
 * shape that has no DB columns yet) until Phase 2 ingests it into a typed
 * table. Everything else (Business, Score, Issue, UnderratedList,
 * ReviewAnalysis) round-trips through Postgres.
 *
 * `BusinessArtifact` shape is preserved verbatim from the prior loader so
 * route files only had to switch to async. Field-by-field:
 *   - `business`        → businesses + business_signals + business_photos +
 *                         business_review_keywords (joined into one Business)
 *   - `score`           → scores (ranks JSONB unpacked back to flat fields)
 *   - `meta`            → JSON file (legacy; not yet in DB)
 *   - `momentum_source` → static "instagram_scrape" (was per-row in JSON;
 *                         only one historical value, retained as default)
 */

export const DEFAULT_ISSUE_SLUG = "2026-spring";

/* --------------------------------- types --------------------------------- */

export interface BusinessArtifact {
  business: Business;
  score: Score;
  meta: {
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
    reviewsDistribution: {
      oneStar: number;
      twoStar: number;
      threeStar: number;
      fourStar: number;
      fiveStar: number;
    } | null;
    rawReviewsCount: number;
    reviewTexts: string[];
    keywordPhrases: { text: string; count: number; exampleQuote: string }[];
  };
  momentum_source: string;
}

export interface BusinessSummary {
  slug: string;
  name: string;
  category: Category;
  neighborhood: string;
  tier: Tier;
  hero_photo: string | null;
  composite: number;
}

export interface BusinessSearchItem {
  slug: string;
  name: string;
  category: Category;
  neighborhood: string;
  tier: Tier;
  hero_photo: string | null;
}

/* --------------------------- legacy meta loader -------------------------- */

const BUSINESSES_DIR = path.join(process.cwd(), "content", "businesses");

const EMPTY_META: BusinessArtifact["meta"] = {
  placeId: "",
  categoryName: "",
  imagesCount: 0,
  imageCategories: [],
  fromTheBusinessFlags: [],
  hasWebsite: false,
  hasPhone: false,
  phone: null,
  hasOpeningHours: false,
  claimThisBusiness: null,
  reviewsDistribution: null,
  rawReviewsCount: 0,
  reviewTexts: [],
  keywordPhrases: [],
};

/**
 * Read the legacy `_meta` block from `content/businesses/<slug>.json`. The
 * Apify scraper detail (image counts, review distribution, raw review text,
 * etc.) does not yet have a DB home. Phase 2 will migrate this into typed
 * columns; until then we keep this single residual JSON read so the business
 * page renders the same insight blocks as before.
 */
function loadLegacyMeta(slug: string): BusinessArtifact["meta"] {
  const file = path.join(BUSINESSES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return EMPTY_META;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      _meta?: Partial<BusinessArtifact["meta"]>;
    };
    const meta = raw._meta ?? {};
    return {
      placeId: meta.placeId ?? "",
      categoryName: meta.categoryName ?? "",
      imagesCount: meta.imagesCount ?? 0,
      imageCategories: meta.imageCategories ?? [],
      fromTheBusinessFlags: meta.fromTheBusinessFlags ?? [],
      hasWebsite: meta.hasWebsite ?? false,
      hasPhone: meta.hasPhone ?? false,
      phone: meta.phone ?? null,
      hasOpeningHours: meta.hasOpeningHours ?? false,
      claimThisBusiness: meta.claimThisBusiness ?? null,
      reviewsDistribution: meta.reviewsDistribution ?? null,
      rawReviewsCount: meta.rawReviewsCount ?? 0,
      reviewTexts: meta.reviewTexts ?? [],
      keywordPhrases: meta.keywordPhrases ?? [],
    };
  } catch {
    return EMPTY_META;
  }
}

/* ------------------------------- assemblers ------------------------------ */

type BusinessRow = typeof businessesTable.$inferSelect;
type SignalsRow = typeof businessSignalsTable.$inferSelect;
type PhotoRow = typeof businessPhotosTable.$inferSelect;
type KeywordRow = typeof businessReviewKeywordsTable.$inferSelect;
type ScoreRow = typeof scoresTable.$inferSelect;

function assembleBusiness(
  bizRow: BusinessRow,
  signals: SignalsRow | undefined,
  photos: PhotoRow[],
  keywords: KeywordRow[],
): Business {
  const candidate = {
    slug: bizRow.slug,
    name: bizRow.name,
    category: bizRow.category,
    neighborhood: bizRow.neighborhood,
    address: bizRow.address,
    website: bizRow.website ?? undefined,
    instagram: bizRow.instagram ?? undefined,
    tiktok: bizRow.tiktok ?? undefined,
    google_rating: signals?.google_rating ?? undefined,
    google_review_count: signals?.google_review_count ?? undefined,
    review_freshness_days: signals?.review_freshness_days ?? undefined,
    posts_last_30: signals?.posts_last_30 ?? undefined,
    reels_last_30: signals?.reels_last_30 ?? undefined,
    has_booking_link: signals?.has_booking_link ?? undefined,
    has_ugc_visible: signals?.has_ugc_visible ?? undefined,
    photos: photos
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ url: p.url, source: p.source })),
    hero_photo: bizRow.hero_photo ?? undefined,
    review_keywords: keywords.map((k) => k.keyword),
    created_at: bizRow.created_at.toISOString(),
    updated_at: bizRow.updated_at.toISOString(),
    claimed: bizRow.claimed,
    owner_email: bizRow.owner_email ?? undefined,
  };
  return BusinessSchema.parse(candidate);
}

function assembleScore(scoreRow: ScoreRow): Score {
  // Schema flattens ranks; DB stores them as a JSONB object.
  const candidate = {
    business_slug: scoreRow.business_slug,
    issue_slug: scoreRow.issue_slug,
    subscores: scoreRow.subscores,
    composite: scoreRow.composite,
    tier: scoreRow.tier,
    rank_category: scoreRow.ranks.category,
    rank_neighborhood: scoreRow.ranks.neighborhood,
    rank_overall: scoreRow.ranks.overall,
    movement: scoreRow.movement,
    unfair_advantage: scoreRow.unfair_advantage,
    scored_at: scoreRow.scored_at.toISOString(),
  };
  return ScoreSchema.parse(candidate);
}

/* --------------------------- single-business read ------------------------ */

/**
 * Load one business plus its current-issue score, signals, photos, and
 * review-keyword set. Returns null when the slug is unknown or the row set
 * is incomplete (no score for the current issue).
 */
export async function loadBusinessBySlug(
  slug: string,
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<BusinessArtifact | null> {
  const [bizRow] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.slug, slug))
    .limit(1);
  if (!bizRow) return null;

  const [signalsRow] = await db
    .select()
    .from(businessSignalsTable)
    .where(
      and(
        eq(businessSignalsTable.business_slug, slug),
        eq(businessSignalsTable.issue_slug, issueSlug),
      ),
    )
    .limit(1);

  const photoRows = await db
    .select()
    .from(businessPhotosTable)
    .where(eq(businessPhotosTable.business_slug, slug));

  const keywordRows = await db
    .select()
    .from(businessReviewKeywordsTable)
    .where(eq(businessReviewKeywordsTable.business_slug, slug));

  const [scoreRow] = await db
    .select()
    .from(scoresTable)
    .where(
      and(
        eq(scoresTable.business_slug, slug),
        eq(scoresTable.issue_slug, issueSlug),
      ),
    )
    .limit(1);
  if (!scoreRow) return null;

  return {
    business: assembleBusiness(bizRow, signalsRow, photoRows, keywordRows),
    score: assembleScore(scoreRow),
    meta: loadLegacyMeta(slug),
    momentum_source: "instagram_scrape",
  };
}

/* --------------------------- bulk-business reads ------------------------- */

/**
 * Slug list for `generateStaticParams`. Pulls only the column we need.
 */
export async function listAllBusinessSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: businessesTable.slug })
    .from(businessesTable);
  return rows.map((r) => r.slug).sort();
}

export async function getAllBusinessSlugs(): Promise<string[]> {
  return listAllBusinessSlugs();
}

/**
 * Load every business with its current-issue artifact. Used for peer-set
 * computations (medians, family stats) and the homepage Top 5 / search.
 *
 * Single-batch implementation: pull every table once and group in memory.
 * Beats N round-trips for 30+ slugs over Neon HTTP.
 */
export async function loadAllBusinesses(
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<BusinessArtifact[]> {
  const [bizRows, signalRows, photoRows, keywordRows, scoreRows] =
    await Promise.all([
      db.select().from(businessesTable),
      db
        .select()
        .from(businessSignalsTable)
        .where(eq(businessSignalsTable.issue_slug, issueSlug)),
      db.select().from(businessPhotosTable),
      db.select().from(businessReviewKeywordsTable),
      db
        .select()
        .from(scoresTable)
        .where(eq(scoresTable.issue_slug, issueSlug)),
    ]);

  const signalsBySlug = new Map(signalRows.map((r) => [r.business_slug, r]));
  const scoresBySlug = new Map(scoreRows.map((r) => [r.business_slug, r]));
  const photosBySlug = new Map<string, PhotoRow[]>();
  for (const p of photoRows) {
    const arr = photosBySlug.get(p.business_slug) ?? [];
    arr.push(p);
    photosBySlug.set(p.business_slug, arr);
  }
  const keywordsBySlug = new Map<string, KeywordRow[]>();
  for (const k of keywordRows) {
    const arr = keywordsBySlug.get(k.business_slug) ?? [];
    arr.push(k);
    keywordsBySlug.set(k.business_slug, arr);
  }

  const out: BusinessArtifact[] = [];
  for (const bizRow of bizRows) {
    const scoreRow = scoresBySlug.get(bizRow.slug);
    if (!scoreRow) continue;
    out.push({
      business: assembleBusiness(
        bizRow,
        signalsBySlug.get(bizRow.slug),
        photosBySlug.get(bizRow.slug) ?? [],
        keywordsBySlug.get(bizRow.slug) ?? [],
      ),
      score: assembleScore(scoreRow),
      meta: loadLegacyMeta(bizRow.slug),
      momentum_source: "instagram_scrape",
    });
  }
  return out.sort((a, b) => a.business.slug.localeCompare(b.business.slug));
}

/* --------------------------- summary / search reads ---------------------- */

/**
 * Slim shape used by the homepage hero search prop and other listing UIs
 * that don't need the full meta or subscore breakdown.
 */
export async function getAllBusinessesForSearch(
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<BusinessSearchItem[]> {
  const all = await loadAllBusinesses(issueSlug);
  return all.map((a) => ({
    slug: a.business.slug,
    name: a.business.name,
    category: a.business.category,
    neighborhood: a.business.neighborhood,
    tier: a.score.tier,
    hero_photo: a.business.hero_photo ?? a.business.photos[0]?.url ?? null,
  }));
}

export async function getBusinessesForCategory(
  category: Category,
  issueSlug: string = DEFAULT_ISSUE_SLUG,
  limit?: number,
): Promise<BusinessSummary[]> {
  const all = await loadAllBusinesses(issueSlug);
  const filtered = all.filter((a) => a.business.category === category);
  const sorted = filtered.sort((a, b) => b.score.composite - a.score.composite);
  const items = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  return items.map((a) => ({
    slug: a.business.slug,
    name: a.business.name,
    category: a.business.category,
    neighborhood: a.business.neighborhood,
    tier: a.score.tier,
    hero_photo: a.business.hero_photo ?? a.business.photos[0]?.url ?? null,
    composite: a.score.composite,
  }));
}

export async function getBusinessesForTier(
  tier: Tier,
  issueSlug: string = DEFAULT_ISSUE_SLUG,
  limit?: number,
): Promise<BusinessSummary[]> {
  const all = await loadAllBusinesses(issueSlug);
  const filtered = all.filter((a) => a.score.tier === tier);
  const sorted = filtered.sort((a, b) => b.score.composite - a.score.composite);
  const items = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  return items.map((a) => ({
    slug: a.business.slug,
    name: a.business.name,
    category: a.business.category,
    neighborhood: a.business.neighborhood,
    tier: a.score.tier,
    hero_photo: a.business.hero_photo ?? a.business.photos[0]?.url ?? null,
    composite: a.score.composite,
  }));
}

/* --------------------------- review analysis ----------------------------- */

/**
 * DB-backed review analysis loader. Returns the same `ReviewAnalysis`
 * shape the JSON loader did, sourced from the `analyses` table.
 */
export async function loadReviewAnalysis(
  slug: string,
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<ReviewAnalysis | null> {
  const [row] = await db
    .select()
    .from(analysesTable)
    .where(
      and(
        eq(analysesTable.business_slug, slug),
        eq(analysesTable.issue_slug, issueSlug),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    slug: row.business_slug,
    themes: row.themes,
    sentiment_summary: row.sentiment_summary,
    notable_quote: row.notable_quote,
    review_count: row.review_count,
    analyzed_at: row.generated_at.toISOString(),
    model: row.model,
    quarter_narrative: row.quarter_narrative ?? undefined,
    tldr_read: row.tldr_read ?? undefined,
    tldr_meaning: row.tldr_meaning ?? undefined,
    playbook: row.playbook ?? undefined,
    diagnosis_pullquote: row.diagnosis_pullquote ?? undefined,
  };
}

/**
 * Bulk load every analysis for an issue. Used by warm-cached helpers that
 * don't want to fan out N queries.
 */
export async function loadAllReviewAnalyses(
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<Map<string, ReviewAnalysis>> {
  const rows = await db
    .select()
    .from(analysesTable)
    .where(eq(analysesTable.issue_slug, issueSlug));
  const out = new Map<string, ReviewAnalysis>();
  for (const row of rows) {
    out.set(row.business_slug, {
      slug: row.business_slug,
      themes: row.themes,
      sentiment_summary: row.sentiment_summary,
      notable_quote: row.notable_quote,
      review_count: row.review_count,
      analyzed_at: row.generated_at.toISOString(),
      model: row.model,
      quarter_narrative: row.quarter_narrative ?? undefined,
      tldr_read: row.tldr_read ?? undefined,
      tldr_meaning: row.tldr_meaning ?? undefined,
      playbook: row.playbook ?? undefined,
      diagnosis_pullquote: row.diagnosis_pullquote ?? undefined,
    });
  }
  return out;
}

/* --------------------------- underrated lists ---------------------------- */

export async function getUnderratedListByCategory(
  category: Category,
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<UnderratedList | null> {
  const [row] = await db
    .select()
    .from(underratedListsTable)
    .where(
      and(
        eq(underratedListsTable.category, category),
        eq(underratedListsTable.issue_slug, issueSlug),
      ),
    )
    .limit(1);
  if (!row) return null;
  return UnderratedListSchema.parse({
    issue_slug: row.issue_slug,
    category: row.category,
    title: row.title,
    intro: row.intro,
    entries: row.entries,
  });
}

export async function getAllUnderratedLists(
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<UnderratedList[]> {
  const rows = await db
    .select()
    .from(underratedListsTable)
    .where(eq(underratedListsTable.issue_slug, issueSlug));
  return rows.map((row) =>
    UnderratedListSchema.parse({
      issue_slug: row.issue_slug,
      category: row.category,
      title: row.title,
      intro: row.intro,
      entries: row.entries,
    }),
  );
}

/* -------------------------------- issues --------------------------------- */

export async function getIssue(
  slug: string = DEFAULT_ISSUE_SLUG,
): Promise<Issue | null> {
  const [row] = await db
    .select()
    .from(issuesTable)
    .where(eq(issuesTable.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    season: row.season,
    year: row.year,
    published_at: row.published_at.toISOString(),
    cover_blurb: row.cover_blurb,
    features: [],
    underrated_lists: await getAllUnderratedLists(slug),
    stats: row.stats,
  };
}

/* ------------------------------- aliases --------------------------------- */

/**
 * Convenience alias matching the spec's `getBusiness` name. Returns the same
 * full artifact as `loadBusinessBySlug`.
 */
export const getBusiness = loadBusinessBySlug;

/* -------------------- internal helper for batch loaders ------------------ */

/**
 * Load a specific subset of businesses by slug. Used by editorial-list
 * pages that want to render a curated slug list in caller-controlled order.
 */
export async function loadBusinessesBySlugs(
  slugs: string[],
  issueSlug: string = DEFAULT_ISSUE_SLUG,
): Promise<Map<string, BusinessArtifact>> {
  if (slugs.length === 0) return new Map();
  const [bizRows, signalRows, photoRows, keywordRows, scoreRows] =
    await Promise.all([
      db
        .select()
        .from(businessesTable)
        .where(inArray(businessesTable.slug, slugs)),
      db
        .select()
        .from(businessSignalsTable)
        .where(
          and(
            inArray(businessSignalsTable.business_slug, slugs),
            eq(businessSignalsTable.issue_slug, issueSlug),
          ),
        ),
      db
        .select()
        .from(businessPhotosTable)
        .where(inArray(businessPhotosTable.business_slug, slugs)),
      db
        .select()
        .from(businessReviewKeywordsTable)
        .where(inArray(businessReviewKeywordsTable.business_slug, slugs)),
      db
        .select()
        .from(scoresTable)
        .where(
          and(
            inArray(scoresTable.business_slug, slugs),
            eq(scoresTable.issue_slug, issueSlug),
          ),
        ),
    ]);

  const signalsBySlug = new Map(signalRows.map((r) => [r.business_slug, r]));
  const scoresBySlug = new Map(scoreRows.map((r) => [r.business_slug, r]));
  const photosBySlug = new Map<string, PhotoRow[]>();
  for (const p of photoRows) {
    const arr = photosBySlug.get(p.business_slug) ?? [];
    arr.push(p);
    photosBySlug.set(p.business_slug, arr);
  }
  const keywordsBySlug = new Map<string, KeywordRow[]>();
  for (const k of keywordRows) {
    const arr = keywordsBySlug.get(k.business_slug) ?? [];
    arr.push(k);
    keywordsBySlug.set(k.business_slug, arr);
  }

  const out = new Map<string, BusinessArtifact>();
  for (const bizRow of bizRows) {
    const scoreRow = scoresBySlug.get(bizRow.slug);
    if (!scoreRow) continue;
    out.set(bizRow.slug, {
      business: assembleBusiness(
        bizRow,
        signalsBySlug.get(bizRow.slug),
        photosBySlug.get(bizRow.slug) ?? [],
        keywordsBySlug.get(bizRow.slug) ?? [],
      ),
      score: assembleScore(scoreRow),
      meta: loadLegacyMeta(bizRow.slug),
      momentum_source: "instagram_scrape",
    });
  }
  return out;
}
