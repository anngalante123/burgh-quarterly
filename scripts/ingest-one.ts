#!/usr/bin/env tsx
/**
 * scripts/ingest-one.ts
 *
 * Single-business pipeline orchestrator. Phase 2, chunk B of the 8-phase
 * scale-up. Takes either an existing slug or (Phase 3) a place_id and runs
 * the full ingestion pipeline through to a DB row, with per-step
 * checkpointing in the ingest_runs table so transient failures mid-batch
 * don't waste API spend already incurred.
 *
 * Usage:
 *   npx tsx scripts/ingest-one.ts --slug <slug>
 *   npx tsx scripts/ingest-one.ts --slug <slug> --dry-run
 *   npx tsx scripts/ingest-one.ts --slug <slug> --resume
 *   npx tsx scripts/ingest-one.ts --slug <slug> --force
 *   npx tsx scripts/ingest-one.ts --place-id <pid>           # Phase 3 stub
 *   npx tsx scripts/ingest-one.ts --batch --category <c> --budget <usd>
 *
 * Hard rules (project):
 *   1. No em-dashes anywhere in this file. Use commas, periods, semicolons.
 *   2. Idempotent: every DB write is an UPSERT keyed on
 *      (business_slug, issue_slug). Re-runs are safe.
 *   3. Resume-friendly: each step writes a row to ingest_runs with a status
 *      so future invocations can skip completed work or retry failures.
 *
 * No new dependencies introduced; reuses Drizzle, neon-http, Anthropic SDK,
 * and tsx that are already in package.json.
 */
import fs from "node:fs";
import path from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gt, gte, sum } from "drizzle-orm";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import {
  BusinessSchema,
  ScoreSchema,
  type Business,
  type Score,
  type ScoreBreakdown,
} from "@/lib/data/schemas";
import {
  normalizeApifyRecordWithMeta,
  type NormalizedArtifact,
} from "@/lib/data/normalize";
import { isChain } from "@/lib/data/chain-detection";
import { isInPittsburghMetro } from "@/lib/data/geo-filter";
import { uploadPhotoToBlob } from "@/lib/scrape/blob-upload";
import type {
  AnalysisPlaybookItem,
  DiagnosisPullquote,
} from "@/lib/data/load-review-analysis";
import {
  composite as computeComposite,
  scoreSubscores,
  tierOf,
  type IgSnapshot,
} from "@/lib/scoring/score";
// Deferred-import the DB client. lib/db/client.ts throws at module load if
// DATABASE_URL is missing, and we want --dry-run to work without it. Real
// callers populate DATABASE_URL via .env.local; the lazy import below picks
// it up after dotenv has loaded.
type DbModule = typeof import("@/lib/db/client");
let _dbMod: DbModule | null = null;
async function getDb(): Promise<DbModule> {
  if (_dbMod) return _dbMod;
  _dbMod = await import("@/lib/db/client");
  return _dbMod;
}
import {
  analyzeOne,
  assembleAnalyzeInput,
  MODEL,
  printDryRun,
  type AnalyzeInput,
} from "@/scripts/analyze-business";
import {
  familyForBusinessCategory,
  type CategoryFamily,
} from "@/lib/data/category-family";

/* ----------------------------- Constants -------------------------------- */

const ROOT = process.cwd();
const BUSINESSES_DIR = path.join(ROOT, "content", "businesses");
const SOCIAL_DIR = path.join(ROOT, "content", "social");
const QUEUES_DIR = path.join(ROOT, "content", "queues");
const DEFAULT_ISSUE_SLUG = "2026-spring";

/** Apify Google Maps actor (compass/crawler-google-places). */
const APIFY_GMAPS_ACTOR = "compass~crawler-google-places";
const APIFY_BASE = "https://api.apify.com/v2";
/**
 * Conservative upper bound for the Anthropic spend of one analyze call. The
 * batch loop halts when cumulative_spent + ESTIMATED_NEXT_USD would exceed
 * the budget. Sized to never get blindsided by a single expensive call.
 */
const ESTIMATED_NEXT_USD = 0.2;

const PIPELINE_STEPS = [
  "scraped",
  "photos_uploaded",
  "scored",
  "analyzed",
] as const;
type PipelineStep = (typeof PIPELINE_STEPS)[number];

/**
 * Editorial forbidden phrases. Anything from this list appearing in an
 * analysis output triggers a needs_review flag (it does NOT block the
 * pipeline; the queue is reviewed manually). Sourced from
 * .claude/memory/EDITORIAL_VOICE.md plus the prompt rules in
 * scripts/analyze-business.ts.
 */
const FORBIDDEN_PHRASES = [
  "leverage",
  "amplify",
  "organic growth",
  "authentic engagement",
  "ai-powered",
  "our algorithm",
  "social signal alone",
  '"best"',
  "best bakery",
  "top-rated",
  "highest quality",
  "finest",
  "most popular",
  "grade a",
];

/* --------------------------- CLI flag parsing --------------------------- */

interface Flags {
  slug: string | null;
  placeId: string | null;
  dryRun: boolean;
  resume: boolean;
  force: boolean;
  batch: boolean;
  category: string | null;
  budget: number | null;
  issueSlug: string;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    slug: null,
    placeId: null,
    dryRun: false,
    resume: false,
    force: false,
    batch: false,
    category: null,
    budget: null,
    issueSlug: DEFAULT_ISSUE_SLUG,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--slug":
        flags.slug = next ?? null;
        i += 1;
        break;
      case "--place-id":
        flags.placeId = next ?? null;
        i += 1;
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      case "--resume":
        flags.resume = true;
        break;
      case "--force":
        flags.force = true;
        break;
      case "--batch":
        flags.batch = true;
        break;
      case "--category":
        flags.category = next ?? null;
        i += 1;
        break;
      case "--budget":
        flags.budget = next ? Number(next) : null;
        i += 1;
        break;
      case "--issue-slug":
        flags.issueSlug = next ?? DEFAULT_ISSUE_SLUG;
        i += 1;
        break;
      default:
        // Tolerate stray flags so future-Claude can add new ones without
        // having to touch the parser first.
        break;
    }
  }
  return flags;
}

/* --------------------------- console helpers ---------------------------- */

function logStart(step: PipelineStep, slug: string) {
  console.log(`[${step}] ${slug}: start`);
}
function logComplete(step: PipelineStep, slug: string, extra = "") {
  console.log(`[${step}] ${slug}: complete${extra ? " " + extra : ""}`);
}
function logSkipped(step: PipelineStep, slug: string, reason: string) {
  console.log(`[${step}] ${slug}: skipped (${reason})`);
}
function logFailed(step: PipelineStep, slug: string, message: string) {
  console.log(`[${step}] ${slug}: failed (${message})`);
}

/* ---------------------------- checkpoint -------------------------------- */

interface RunRow {
  status:
    | "pending"
    | "success"
    | "failed"
    | "skipped_closed"
    | "skipped_chain"
    | "skipped_out_of_geo"
    | "skipped_low_reviews";
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
}

/**
 * Check whether a step should run. Returns the most recent ingest_runs row
 * (if any) so the caller can decide:
 *   - status='success' AND not --force ,, skip.
 *   - status='failed' AND --resume       ,, retry.
 *   - status='pending' (rare, prior run died mid-step)        ,, retry.
 *   - no row                                                  ,, run.
 */
async function checkpointShouldRun(
  slug: string,
  step: PipelineStep,
  flags: Flags,
): Promise<{ run: boolean; reason: string; prior: RunRow | null }> {
  if (flags.force) {
    return { run: true, reason: "--force", prior: null };
  }
  const { db, schema } = await getDb();
  const rows = await db
    .select()
    .from(schema.ingestRuns)
    .where(
      and(
        eq(schema.ingestRuns.business_slug, slug),
        eq(schema.ingestRuns.step, step),
      ),
    )
    .orderBy(desc(schema.ingestRuns.started_at))
    .limit(1);
  const prior = rows[0] ?? null;
  if (!prior) {
    return { run: true, reason: "no prior run", prior: null };
  }
  const priorRow: RunRow = {
    status: prior.status,
    error: prior.error,
    started_at: prior.started_at,
    finished_at: prior.finished_at,
  };
  if (prior.status === "success") {
    return {
      run: false,
      reason: "already succeeded; pass --force to redo",
      prior: priorRow,
    };
  }
  if (
    prior.status === "skipped_closed" ||
    prior.status === "skipped_chain" ||
    prior.status === "skipped_out_of_geo" ||
    prior.status === "skipped_low_reviews"
  ) {
    return {
      run: false,
      reason: `previously ${prior.status}; pass --force to redo`,
      prior: priorRow,
    };
  }
  if (prior.status === "failed") {
    if (flags.resume) {
      return { run: true, reason: "--resume retry", prior: priorRow };
    }
    return {
      run: false,
      reason: "prior run failed; pass --resume to retry",
      prior: priorRow,
    };
  }
  // pending (very rare; only happens if a previous process died mid-step)
  return { run: true, reason: "prior run pending; retry", prior: priorRow };
}

async function checkpointWritePending(
  slug: string,
  step: PipelineStep,
): Promise<void> {
  const { db, schema } = await getDb();
  await db
    .insert(schema.ingestRuns)
    .values({
      business_slug: slug,
      step,
      status: "pending",
      error: null,
      started_at: new Date(),
      finished_at: null,
    })
    .onConflictDoUpdate({
      target: [schema.ingestRuns.business_slug, schema.ingestRuns.step],
      set: {
        status: "pending",
        error: null,
        started_at: new Date(),
        finished_at: null,
      },
    });
}

async function checkpointWriteSuccess(
  slug: string,
  step: PipelineStep,
): Promise<void> {
  const { db, schema } = await getDb();
  await db
    .insert(schema.ingestRuns)
    .values({
      business_slug: slug,
      step,
      status: "success",
      error: null,
      finished_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.ingestRuns.business_slug, schema.ingestRuns.step],
      set: {
        status: "success",
        error: null,
        finished_at: new Date(),
      },
    });
}

/**
 * Write a "skipped_*" terminal status to ingest_runs. Used when an input
 * record is dropped before any spend (chain or permanently closed). The FK
 * on ingest_runs.business_slug requires the business row to exist; for a
 * brand-new place_id we have nothing to FK to, so callers must guard. See
 * `flagSkipLoose` for the no-slug variant which logs only.
 */
async function checkpointWriteSkipped(
  slug: string,
  step: PipelineStep,
  status:
    | "skipped_closed"
    | "skipped_chain"
    | "skipped_out_of_geo"
    | "skipped_low_reviews",
  reason: string,
): Promise<void> {
  const { db, schema } = await getDb();
  await db
    .insert(schema.ingestRuns)
    .values({
      business_slug: slug,
      step,
      status,
      error: reason.slice(0, 2000),
      finished_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.ingestRuns.business_slug, schema.ingestRuns.step],
      set: {
        status,
        error: reason.slice(0, 2000),
        finished_at: new Date(),
      },
    });
}

async function checkpointWriteFailed(
  slug: string,
  step: PipelineStep,
  message: string,
): Promise<void> {
  const { db, schema } = await getDb();
  await db
    .insert(schema.ingestRuns)
    .values({
      business_slug: slug,
      step,
      status: "failed",
      error: message.slice(0, 2000),
      finished_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.ingestRuns.business_slug, schema.ingestRuns.step],
      set: {
        status: "failed",
        error: message.slice(0, 2000),
        finished_at: new Date(),
      },
    });
}

/* -------------------------- legacy JSON loaders ------------------------- */

interface LegacyBusinessFile {
  slug: string;
  business: Business;
  score: Score;
  meta: {
    placeId?: string;
    categoryName?: string;
    imagesCount?: number;
    imageCategories?: string[];
    fromTheBusinessFlags?: string[];
    hasWebsite?: boolean;
    hasPhone?: boolean;
    hasOpeningHours?: boolean;
    claimThisBusiness?: boolean | null;
    reviewsDistribution?: Record<string, number> | null;
    reviewTexts?: string[];
    keywordPhrases?: { text: string; count: number; exampleQuote: string }[];
  } | null;
}

function loadBusinessFile(slug: string): LegacyBusinessFile | null {
  const file = path.join(BUSINESSES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const { _meta, _score, ...rest } = raw as {
    _meta?: LegacyBusinessFile["meta"];
    _score?: unknown;
  };
  const biz = BusinessSchema.safeParse(rest);
  if (!biz.success) {
    throw new Error(
      `BusinessSchema parse failed for ${slug}: ${biz.error.message.slice(0, 300)}`,
    );
  }
  const score = ScoreSchema.safeParse(_score);
  if (!score.success) {
    throw new Error(
      `ScoreSchema parse failed for ${slug}: ${score.error.message.slice(0, 300)}`,
    );
  }
  return {
    slug,
    business: biz.data,
    score: score.data,
    meta: _meta ?? null,
  };
}

/**
 * DB-backed reconstruction of LegacyBusinessFile. Used by the slug-resume
 * path when the per-slug JSON does not exist on disk (the Phase 7 batch
 * ingest path writes straight to DB and never produces a JSON file). All
 * downstream pipeline steps consume the legacy shape, so this lets a
 * --resume run the analyze step on any business that already has a row
 * in `businesses` plus reviews and a score for the active issue.
 */
async function loadBusinessFromDb(
  slug: string,
  issueSlug: string,
): Promise<LegacyBusinessFile | null> {
  const { db, schema } = await getDb();
  const bizRows = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, slug))
    .limit(1);
  if (bizRows.length === 0) return null;
  const b = bizRows[0];

  const signalsRows = await db
    .select()
    .from(schema.businessSignals)
    .where(
      and(
        eq(schema.businessSignals.business_slug, slug),
        eq(schema.businessSignals.issue_slug, issueSlug),
      ),
    )
    .limit(1);
  const sig = signalsRows[0] ?? null;

  const reviewRows = await db
    .select()
    .from(schema.businessReviews)
    .where(eq(schema.businessReviews.business_slug, slug));
  const reviewTexts = reviewRows
    .map((r) => r.text)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const photoRows = await db
    .select()
    .from(schema.businessPhotos)
    .where(eq(schema.businessPhotos.business_slug, slug))
    .orderBy(schema.businessPhotos.sort_order);

  const keywordRows = await db
    .select()
    .from(schema.businessReviewKeywords)
    .where(eq(schema.businessReviewKeywords.business_slug, slug));

  const scoreRows = await db
    .select()
    .from(schema.scores)
    .where(
      and(
        eq(schema.scores.business_slug, slug),
        eq(schema.scores.issue_slug, issueSlug),
      ),
    )
    .limit(1);
  if (scoreRows.length === 0) return null;
  const s = scoreRows[0];

  // business_photos.url is unconstrained text in DB; BusinessPhotoSchema.url
  // is z.string().url(). One malformed row (rare but possible from older
  // ingest paths) would otherwise fail the BusinessSchema parse for the
  // whole slug. Drop the bad rows with a warning so --resume keeps working.
  const validPhotos: { url: string; source: string }[] = [];
  for (const p of photoRows) {
    try {
      new URL(p.url);
      validPhotos.push({ url: p.url, source: p.source });
    } catch {
      console.warn(
        `[loadBusinessFromDb] ${slug}: dropping photo with malformed url at sort_order=${p.sort_order}`,
      );
    }
  }

  // Reconstruct the Zod-shaped Business object from DB columns.
  const businessRaw: Record<string, unknown> = {
    slug: b.slug,
    name: b.name,
    category: b.category,
    neighborhood: b.neighborhood,
    address: b.address,
    photos: validPhotos,
    review_keywords: keywordRows.map((k) => k.keyword),
    created_at: (b.created_at ?? new Date()).toISOString(),
    updated_at: (b.updated_at ?? new Date()).toISOString(),
    claimed: false,
  };
  if (b.website) businessRaw.website = b.website;
  if (b.instagram) businessRaw.instagram = b.instagram;
  if (b.tiktok) businessRaw.tiktok = b.tiktok;
  if (sig) {
    if (sig.google_rating != null) businessRaw.google_rating = sig.google_rating;
    if (sig.google_review_count != null)
      businessRaw.google_review_count = sig.google_review_count;
    if (sig.review_freshness_days != null)
      businessRaw.review_freshness_days = sig.review_freshness_days;
    if (sig.posts_last_30 != null) businessRaw.posts_last_30 = sig.posts_last_30;
    if (sig.reels_last_30 != null) businessRaw.reels_last_30 = sig.reels_last_30;
  }
  // Hero photo: try the businesses.hero_photo column first, fall back to the
  // first valid photo. Same URL-validity guard so the BusinessSchema parse
  // does not blow up on a stray malformed value.
  for (const candidate of [b.hero_photo, validPhotos[0]?.url]) {
    if (!candidate) continue;
    try {
      new URL(candidate);
      businessRaw.hero_photo = candidate;
      break;
    } catch {
      // try the next candidate
    }
  }

  const biz = BusinessSchema.safeParse(businessRaw);
  if (!biz.success) {
    throw new Error(
      `BusinessSchema parse failed for ${slug} (DB): ${biz.error.message.slice(0, 300)}`,
    );
  }

  // Reconstruct the Score object. DB stores ranks as a nested {category,
  // neighborhood, overall} JSONB blob; the Zod schema expects flat
  // rank_category / rank_neighborhood / rank_overall fields.
  const scoreRaw: Record<string, unknown> = {
    business_slug: slug,
    issue_slug: issueSlug,
    subscores: s.subscores,
    composite: s.composite,
    tier: s.tier,
    rank_category: s.ranks?.category ?? 1,
    rank_neighborhood: s.ranks?.neighborhood ?? 1,
    rank_overall: s.ranks?.overall ?? 1,
    movement: s.movement,
    unfair_advantage: s.unfair_advantage,
    scored_at: (s.scored_at ?? new Date()).toISOString(),
  };
  const score = ScoreSchema.safeParse(scoreRaw);
  if (!score.success) {
    throw new Error(
      `ScoreSchema parse failed for ${slug} (DB): ${score.error.message.slice(0, 300)}`,
    );
  }

  // Reconstruct the meta block. Most rich Apify fields (categoryName,
  // imagesCount, hasWebsite, etc.) are not in the DB schema today, so they
  // stay undefined and assembleAnalyzeInput uses its safe fallbacks (0, [],
  // false). The only meta field that MUST be populated is reviewTexts, since
  // analyze-business builds the review block from it.
  const meta: LegacyBusinessFile["meta"] = {
    placeId: b.place_id ?? undefined,
    hasWebsite: !!b.website,
    reviewTexts,
    keywordPhrases: keywordRows.map((k) => ({
      text: k.keyword,
      count: k.frequency ?? 0,
      exampleQuote: "",
    })),
  };

  return {
    slug,
    business: biz.data,
    score: score.data,
    meta,
  };
}

interface SocialFile {
  ig?: {
    handle: string;
    posts_30d: number;
    reels_30d: number;
    avg_engagement_rate: number;
    verified: boolean;
    is_business_account?: boolean;
    biography?: string;
    last_post_at: string | null;
  };
  tiktok_mentions?: unknown;
}

function loadSocialFile(slug: string): SocialFile {
  const file = path.join(SOCIAL_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    const tiktok_mentions = raw.tiktok_mentions;
    const hasFlatIg = !raw.ig && raw.handle;
    if (hasFlatIg) {
      return {
        ig: raw as unknown as SocialFile["ig"],
        tiktok_mentions,
      };
    }
    return {
      ig: raw.ig as SocialFile["ig"],
      tiktok_mentions,
    };
  } catch {
    return {};
  }
}

/* --------------------------- family helpers ----------------------------- */

/**
 * Editorial families are keyed off the internal Zod Category enum (not the
 * raw Google `categoryName` string). The previous Google-text-keyed lookup
 * fell into a "Pittsburgh Businesses" bucket for every category outside
 * the four it knew about (sweets, cafes, asian, bars). That bug bled
 * "Nan Xiang Soup Dumplings" into tattoo studio narratives because every
 * tattoo shop landed in the catch-all bucket alongside the food-leader.
 *
 * Single source of truth lives in lib/data/category-family.ts.
 */

/**
 * Below this many peers (counting the target), the family is "small" and
 * the editorial copy should hedge. We do NOT collapse small families into
 * a parent bucket here, that's out of scope for the bug fix; we just log.
 */
const MIN_FAMILY_SIZE = 5;

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = vals.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

interface FamilyContext {
  fam: CategoryFamily;
  rank: number;
  size: number;
  leaderName: string;
  leaderAdvantage: string;
  peerMedians: Record<string, number>;
}

/**
 * Build the family context (rank, leader, peer medians) for the target
 * business by querying the DB for ALL businesses + scores in the active
 * issue. Replaces the disk-only loader, which only saw the 30 calibration
 * JSON files and forced every DB-only category (tattoo, spa, salon...)
 * into a fallback "Pittsburgh Businesses" bucket alongside food-leaders.
 *
 * Family grouping is keyed off the typed `businesses.category` enum via
 * familyForBusinessCategory, so adding a new Category to the enum without
 * adding it to the family map will fail typecheck loudly.
 */
async function buildFamilyContext(
  target: LegacyBusinessFile,
  issueSlug: string,
): Promise<FamilyContext> {
  const { db, schema } = await getDb();
  // Pull every business with a score for this issue. We need composite
  // (for ranking + leader), subscores (for medians), unfair_advantage
  // (for leader's standout signal), and category (for grouping).
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
        eq(schema.scores.issue_slug, issueSlug),
      ),
    );

  const targetCategory = target.business.category;
  const fam = familyForBusinessCategory(targetCategory);
  const sameFamily = rows.filter(
    (r) => familyForBusinessCategory(r.category).key === fam.key,
  );

  // Target may not yet have a score row in the DB at the moment this runs
  // (scored step writes immediately before analyze, so usually it does);
  // fall back to the in-memory legacy score if missing so the target is
  // counted in size + rank correctly.
  const hasTarget = sameFamily.some((r) => r.slug === target.slug);
  if (!hasTarget) {
    sameFamily.push({
      slug: target.slug,
      name: target.business.name,
      category: targetCategory,
      composite: target.score.composite,
      subscores: target.score.subscores,
      unfair_advantage: target.score.unfair_advantage,
    });
  }

  const ranked = [...sameFamily].sort((a, b) => b.composite - a.composite);
  const rank = ranked.findIndex((r) => r.slug === target.slug) + 1;

  // Leader = highest composite within the family, EXCLUDING the target
  // itself. If the target IS the leader, we still need a "leader-advantage"
  // string to feed the prompt; use the runner-up so the editorial line
  // doesn't compare the business to itself.
  const nonTarget = ranked.filter((r) => r.slug !== target.slug);
  const leader = nonTarget[0] ?? null;

  const peerMedians: Record<string, number> = {
    content_canvas: median(sameFamily.map((r) => r.subscores.content_canvas)),
    community_spark: median(
      sameFamily.map((r) => r.subscores.community_spark),
    ),
    conversion_path: median(
      sameFamily.map((r) => r.subscores.conversion_path),
    ),
    momentum: median(sameFamily.map((r) => r.subscores.momentum)),
    collab_fit: median(sameFamily.map((r) => r.subscores.collab_fit)),
  };

  if (sameFamily.length < MIN_FAMILY_SIZE) {
    console.warn(
      `[family] ${target.slug}: small family "${fam.label}" has only ${sameFamily.length} member(s) (min ${MIN_FAMILY_SIZE} for a confident peer comparison). Editorial copy may hedge.`,
    );
  }

  return {
    fam,
    rank: rank > 0 ? rank : 1,
    size: sameFamily.length,
    leaderName: leader?.name ?? target.business.name,
    leaderAdvantage: leader?.unfair_advantage?.label ?? "",
    peerMedians,
  };
}

/* ----------------------------- pipeline --------------------------------- */

interface StepPlan {
  step: PipelineStep;
  willRun: boolean;
  reason: string;
}

async function planSteps(slug: string, flags: Flags): Promise<StepPlan[]> {
  const out: StepPlan[] = [];
  for (const step of PIPELINE_STEPS) {
    if (flags.dryRun) {
      out.push({ step, willRun: true, reason: "dry-run, would run" });
      continue;
    }
    const decision = await checkpointShouldRun(slug, step, flags);
    out.push({ step, willRun: decision.run, reason: decision.reason });
  }
  return out;
}

/* --------------------- step 1: scraped (load source) -------------------- */

async function stepScraped(
  slug: string,
  flags: Flags,
): Promise<LegacyBusinessFile> {
  logStart("scraped", slug);
  const decision = flags.dryRun
    ? { run: true, reason: "dry-run" }
    : await checkpointShouldRun(slug, "scraped", flags);
  if (!decision.run) {
    logSkipped("scraped", slug, decision.reason);
    const parsed =
      loadBusinessFile(slug) ??
      (flags.dryRun ? null : await loadBusinessFromDb(slug, flags.issueSlug));
    if (!parsed)
      throw new Error(
        `[scraped] ${slug}: no content/businesses/${slug}.json on disk and no DB row for issue ${flags.issueSlug}.`,
      );
    return parsed;
  }
  if (!flags.dryRun) await checkpointWritePending(slug, "scraped");
  try {
    const parsed =
      loadBusinessFile(slug) ??
      (flags.dryRun ? null : await loadBusinessFromDb(slug, flags.issueSlug));
    if (!parsed) {
      throw new Error(
        `no content/businesses/${slug}.json on disk and no DB row for issue ${flags.issueSlug}. For brand-new place_ids use the --place-id path.`,
      );
    }
    if (!flags.dryRun) await checkpointWriteSuccess(slug, "scraped");
    logComplete("scraped", slug, `${parsed.meta?.reviewTexts?.length ?? 0} reviews loaded`);
    return parsed;
  } catch (e) {
    const msg = (e as Error).message;
    if (!flags.dryRun) await checkpointWriteFailed(slug, "scraped", msg);
    logFailed("scraped", slug, msg);
    throw e;
  }
}

/* ----------------- step 2: photos_uploaded (Phase 3 stub) --------------- */

async function stepPhotosUploaded(
  slug: string,
  flags: Flags,
): Promise<void> {
  logStart("photos_uploaded", slug);
  const decision = flags.dryRun
    ? { run: true, reason: "dry-run" }
    : await checkpointShouldRun(slug, "photos_uploaded", flags);
  if (!decision.run) {
    logSkipped("photos_uploaded", slug, decision.reason);
    return;
  }
  if (!flags.dryRun) await checkpointWritePending(slug, "photos_uploaded");
  try {
    // For an existing slug, photos are already in business_photos from the
    // Phase 1 migration. No-op here. Phase 3 will run Vercel Blob uploads
    // for newly scraped place_ids in this step.
    if (!flags.dryRun) await checkpointWriteSuccess(slug, "photos_uploaded");
    logComplete(
      "photos_uploaded",
      slug,
      "no-op for existing slug; Phase 3 will upload for new place_ids",
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (!flags.dryRun) await checkpointWriteFailed(slug, "photos_uploaded", msg);
    logFailed("photos_uploaded", slug, msg);
    throw e;
  }
}

/* ------------------------- step 3: scored ------------------------------- */

async function stepScored(
  slug: string,
  parsed: LegacyBusinessFile,
  flags: Flags,
): Promise<{ subscores: ScoreBreakdown; composite: number; tier: Score["tier"] }> {
  logStart("scored", slug);
  const decision = flags.dryRun
    ? { run: true, reason: "dry-run" }
    : await checkpointShouldRun(slug, "scored", flags);
  if (!decision.run) {
    logSkipped("scored", slug, decision.reason);
    // Re-derive on read so callers can still display tier/composite even
    // when we skip the write. Cheap; deterministic.
    const subs = scoreFromLegacy(parsed);
    const comp = computeComposite(subs);
    return { subscores: subs, composite: comp, tier: tierOf(comp) };
  }
  if (!flags.dryRun) await checkpointWritePending(slug, "scored");
  try {
    const subscores = scoreFromLegacy(parsed);
    const comp = computeComposite(subscores);
    const tier = tierOf(comp);
    if (!flags.dryRun) {
      const { db, schema } = await getDb();
      const scoreRow = {
        business_slug: parsed.business.slug,
        issue_slug: flags.issueSlug,
        subscores,
        composite: comp,
        tier,
        ranks: {
          category: parsed.score.rank_category,
          neighborhood: parsed.score.rank_neighborhood,
          overall: parsed.score.rank_overall,
        },
        movement: parsed.score.movement,
        unfair_advantage: parsed.score.unfair_advantage,
        scored_at: new Date(),
      };
      await db
        .insert(schema.scores)
        .values(scoreRow)
        .onConflictDoUpdate({
          target: [schema.scores.business_slug, schema.scores.issue_slug],
          set: {
            subscores: scoreRow.subscores,
            composite: scoreRow.composite,
            tier: scoreRow.tier,
            ranks: scoreRow.ranks,
            movement: scoreRow.movement,
            unfair_advantage: scoreRow.unfair_advantage,
            scored_at: scoreRow.scored_at,
          },
        });
      await checkpointWriteSuccess(slug, "scored");
    }
    logComplete(
      "scored",
      slug,
      `tier=${tier} composite=${comp}`,
    );
    return { subscores, composite: comp, tier };
  } catch (e) {
    const msg = (e as Error).message;
    if (!flags.dryRun) await checkpointWriteFailed(slug, "scored", msg);
    logFailed("scored", slug, msg);
    throw e;
  }
}

/**
 * Run the deterministic scorer against the legacy JSON shape. Mirrors
 * scoreBusiness() in lib/scoring/score.ts but pulls inputs from the on-disk
 * shape we have today. When Phase 3 lands a typed `apify_raw` table, this
 * helper moves to read from DB instead.
 */
function scoreFromLegacy(parsed: LegacyBusinessFile): ScoreBreakdown {
  const meta = parsed.meta ?? {};
  const art = {
    placeId: meta.placeId ?? "",
    categoryName: meta.categoryName ?? "",
    imagesCount: meta.imagesCount ?? 0,
    imageCategories: meta.imageCategories ?? [],
    fromTheBusinessFlags: meta.fromTheBusinessFlags ?? [],
    hasWebsite: !!meta.hasWebsite,
    hasPhone: !!meta.hasPhone,
    phone: null,
    hasOpeningHours: !!meta.hasOpeningHours,
    claimThisBusiness: meta.claimThisBusiness ?? null,
    reviewsDistribution: null,
    rawReviewsCount: 0,
    reviewTexts: meta.reviewTexts ?? [],
    keywordPhrases: meta.keywordPhrases ?? [],
  };
  const social = loadSocialFile(parsed.slug);
  const ig: IgSnapshot | null = social.ig
    ? {
        handle: social.ig.handle,
        posts_30d: social.ig.posts_30d,
        reels_30d: social.ig.reels_30d,
        avg_engagement_rate: social.ig.avg_engagement_rate,
        verified: social.ig.verified,
      }
    : null;
  return scoreSubscores(parsed.business, art, ig);
}

/* ------------------------- step 4: analyzed ----------------------------- */

async function stepAnalyzed(
  slug: string,
  parsed: LegacyBusinessFile,
  flags: Flags,
): Promise<void> {
  logStart("analyzed", slug);
  const decision = flags.dryRun
    ? { run: true, reason: "dry-run" }
    : await checkpointShouldRun(slug, "analyzed", flags);
  if (!decision.run) {
    logSkipped("analyzed", slug, decision.reason);
    return;
  }

  // Build the AnalyzeInput once; reused by both dry-run printer and live
  // analyzeOne call.
  const reviews = parsed.meta?.reviewTexts ?? [];
  if (reviews.length < 2) {
    const msg = `only ${reviews.length} review(s) on disk; analyze-business expects 2+`;
    if (!flags.dryRun) {
      await checkpointWriteSkipped(slug, "analyzed", "skipped_low_reviews", msg);
    }
    logSkipped("analyzed", slug, msg);
    return;
  }

  const social = loadSocialFile(slug);
  const ctx = await buildFamilyContext(parsed, flags.issueSlug);

  const analyzeInput: AnalyzeInput = assembleAnalyzeInput(
    slug,
    {
      // assembleAnalyzeInput consumes a "raw record" shape that mirrors what
      // analyze-business.ts reads from disk. Reconstruct that shape here so
      // we don't fork the helper signature.
      ...parsed.business,
      _meta: parsed.meta ?? {},
      _score: parsed.score,
    } as unknown as Parameters<typeof assembleAnalyzeInput>[1],
    social,
    reviews,
    ctx.fam,
    ctx.rank,
    ctx.size,
    {
      name: ctx.leaderName,
      _score: { unfair_advantage: { label: ctx.leaderAdvantage } },
    },
    ctx.peerMedians,
  );

  if (flags.dryRun) {
    printDryRun(analyzeInput);
    logComplete("analyzed", slug, "dry-run, no API call, no DB write");
    return;
  }

  await checkpointWritePending(slug, "analyzed");
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY not set in environment. Add it to .env.local before running ingest-one in live mode. Use --dry-run to validate the pipeline without API calls.",
      );
    }
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await analyzeOne(client, analyzeInput);

    const analysisRow = {
      business_slug: slug,
      issue_slug: flags.issueSlug,
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
    const { db, schema } = await getDb();
    await db
      .insert(schema.analyses)
      .values(analysisRow)
      .onConflictDoUpdate({
        target: [
          schema.analyses.business_slug,
          schema.analyses.issue_slug,
        ],
        set: {
          themes: analysisRow.themes,
          notable_quote: analysisRow.notable_quote,
          sentiment_summary: analysisRow.sentiment_summary,
          quarter_narrative: analysisRow.quarter_narrative,
          tldr_read: analysisRow.tldr_read,
          tldr_meaning: analysisRow.tldr_meaning,
          diagnosis_pullquote: analysisRow.diagnosis_pullquote,
          playbook: analysisRow.playbook,
          review_count: analysisRow.review_count,
          model: analysisRow.model,
          prompt_version: analysisRow.prompt_version,
          generated_at: analysisRow.generated_at,
        },
      });

    // QA sweep: flag for needs_review queue if anything looks off. Does NOT
    // block the pipeline; the queue is reviewed manually.
    await qaSweep(slug, result);

    await checkpointWriteSuccess(slug, "analyzed");
    logComplete(
      "analyzed",
      slug,
      `themes=${result.themes?.length ?? 0} playbook=${result.playbook?.length ?? 0}`,
    );
  } catch (e) {
    const msg = (e as Error).message;
    await checkpointWriteFailed(slug, "analyzed", msg);
    logFailed("analyzed", slug, msg);
    throw e;
  }
}

/* ----------------------------- QA sweep --------------------------------- */

async function qaSweep(
  slug: string,
  result: Record<string, unknown>,
): Promise<void> {
  const reasons: string[] = [];
  const collectStrings = (v: unknown): string[] => {
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.flatMap((x) => collectStrings(x));
    if (v && typeof v === "object") {
      return Object.values(v as Record<string, unknown>).flatMap((x) =>
        collectStrings(x),
      );
    }
    return [];
  };
  const themesArr = (result.themes as unknown[]) ?? [];
  const narrative = (result.quarter_narrative as string) ?? "";
  const fields = [
    ...collectStrings(result.themes),
    (result.notable_quote as string) ?? "",
    narrative,
    ...collectStrings(result.playbook),
  ];
  const haystack = fields.join(" \n ").toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (haystack.includes(phrase)) {
      reasons.push(`forbidden phrase: "${phrase}"`);
    }
  }
  // Em-dash paranoia check (post-scrubber). U+2014.
  if (fields.some((s) => s.includes("\u2014"))) {
    reasons.push("em-dash leak (U+2014) in analysis output");
  }
  if (themesArr.length < 3) {
    reasons.push(`themes returned ${themesArr.length}; expected 3+`);
  }
  if (!narrative || narrative.length < 50) {
    reasons.push(
      `quarter_narrative is empty or under 50 chars (got ${narrative.length})`,
    );
  }
  if (reasons.length === 0) return;
  const { db, schema } = await getDb();
  for (const reason of reasons) {
    try {
      await db.insert(schema.needsReview).values({
        business_slug: slug,
        reason,
      });
      console.warn(`[needs_review] ${slug}: ${reason}`);
    } catch (e) {
      console.warn(
        `[needs_review] ${slug}: failed to write flag, continuing. ${(e as Error).message}`,
      );
    }
  }
}

/* ----------------------------- summary ---------------------------------- */

async function readUsdSpentForSlug(slug: string): Promise<number> {
  try {
    const { db, schema } = await getDb();
    const rows = await db
      .select({ total: sum(schema.ingestCostLog.usd_cost) })
      .from(schema.ingestCostLog)
      .where(eq(schema.ingestCostLog.business_slug, slug));
    const raw = rows[0]?.total;
    if (raw === null || raw === undefined) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------ run-one --------------------------------- */

async function runOne(slug: string, flags: Flags): Promise<void> {
  console.log(
    `\n=== ingest-one slug=${slug} issue=${flags.issueSlug} mode=${
      flags.dryRun ? "dry-run" : "live"
    } resume=${flags.resume} force=${flags.force} ===`,
  );

  if (flags.dryRun) {
    const plan = await planSteps(slug, flags);
    console.log("Planned steps:");
    for (const p of plan) {
      console.log(`  - ${p.step}: ${p.willRun ? "WILL RUN" : "skip"} (${p.reason})`);
    }
  }

  const parsed = await stepScraped(slug, flags);

  // Pre-spend filters: skip chains and out-of-geo records before any
  // photos or Claude analyze spend. The Business schema does not carry a
  // permanently-closed flag (closed places are dropped at normalize-time),
  // so the closed branch is meaningful only on the --place-id path; here
  // we re-check the chain blocklist against the existing record's name
  // and the geo window against its address string.
  if (!isInPittsburghMetro({ address: parsed.business.address })) {
    const reason = `out of Pittsburgh metro: address="${parsed.business.address}"`;
    if (!flags.dryRun) {
      await checkpointWriteSkipped(
        slug,
        "scraped",
        "skipped_out_of_geo",
        reason,
      );
    }
    console.log(
      `[skip] ${slug}: ${reason} -> skipped_out_of_geo (no photos, score, or analyze spend)`,
    );
    return;
  }
  if (isChain({ name: parsed.business.name })) {
    const reason = `chain detected: name="${parsed.business.name}"`;
    if (!flags.dryRun) {
      await checkpointWriteSkipped(slug, "scraped", "skipped_chain", reason);
    }
    console.log(
      `[skip] ${slug}: ${reason} -> skipped_chain (no photos, score, or analyze spend)`,
    );
    return;
  }

  await stepPhotosUploaded(slug, flags);
  const scoreOut = await stepScored(slug, parsed, flags);
  await stepAnalyzed(slug, parsed, flags);

  if (!flags.dryRun) {
    const usd = await readUsdSpentForSlug(slug);
    console.log(
      `\n[summary] ${slug}: tier=${scoreOut.tier} composite=${scoreOut.composite} usd_spent_total=$${usd.toFixed(4)} (lifetime ledger sum)`,
    );
  } else {
    console.log(
      `\n[summary] ${slug}: dry-run complete. tier=${scoreOut.tier} composite=${scoreOut.composite}. No DB writes, no API calls.`,
    );
  }
}

/* ----------------------- Apify scrape (--place-id) ---------------------- */

/**
 * Sleep with backoff while polling. Schedule mirrors the Phase 2 retry
 * pattern: 5s, 10s, 20s, 30s, then 30s every 30s up to a 5 min ceiling.
 */
function pollDelays(): number[] {
  const out = [5000, 10000, 20000, 30000];
  // Top up to 5 min total = 300s. We've used 65s already; pad with 30s
  // intervals.
  const remaining = (5 * 60 * 1000 - 65000) / 30000;
  for (let i = 0; i < remaining; i += 1) out.push(30000);
  return out;
}

interface ApifyRunData {
  status: string;
  defaultDatasetId: string;
  usageTotalUsd?: number;
  stats?: { computeUnits?: number };
}

async function startApifyRun(
  placeId: string,
  token: string,
): Promise<string> {
  const url = `${APIFY_BASE}/acts/${APIFY_GMAPS_ACTOR}/runs?token=${token}`;
  const body = {
    placeIds: [placeId],
    maxReviews: 15,
    language: "en",
    maxImages: 20,
    includeWebResults: false,
    scrapePlaceDetailPage: true,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(
      `Apify start run failed ${res.status}: ${t.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function waitForApifyRun(
  runId: string,
  token: string,
): Promise<{ datasetId: string; costUsd: number }> {
  const url = `${APIFY_BASE}/actor-runs/${runId}?token=${token}`;
  const delays = pollDelays();
  for (const d of delays) {
    await new Promise((r) => setTimeout(r, d));
    const res = await fetch(url);
    if (!res.ok) continue;
    const { data } = (await res.json()) as { data: ApifyRunData };
    const cost =
      data.usageTotalUsd ?? (data.stats?.computeUnits ?? 0) * 0.25;
    if (
      ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(data.status)
    ) {
      if (data.status !== "SUCCEEDED") {
        throw new Error(`Apify run ${runId} ended ${data.status}`);
      }
      return { datasetId: data.defaultDatasetId, costUsd: cost };
    }
  }
  throw new Error(`Apify run ${runId} did not complete within ~5 minutes`);
}

async function fetchApifyDataset(
  datasetId: string,
  token: string,
): Promise<unknown[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json&clean=true`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify dataset fetch ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  return (await res.json()) as unknown[];
}

/**
 * Resolve slug collisions for a brand-new scrape.
 *
 * Three cases:
 *   1. baseSlug is unused → return baseSlug.
 *   2. baseSlug exists AND its place_id matches the incoming scrape →
 *      return baseSlug. Re-ingesting the same place_id should update in
 *      place, not create a duplicate row. Pre-2026-05-07 behavior was to
 *      always suffix, which created 377 duplicate businesses across the
 *      Phase 7 sweep. See scripts/dedup-businesses.ts for cleanup.
 *   3. baseSlug exists AND its place_id differs → genuine name collision.
 *      Curated-source rows refuse to clobber and throw. Apify-source rows
 *      get a placeId-derived suffix appended.
 */
async function resolveSlugForNewBusiness(
  baseSlug: string,
  placeId: string,
): Promise<string> {
  const { db, schema } = await getDb();
  const existing = await db
    .select({
      slug: schema.businesses.slug,
      source: schema.businesses.source,
      place_id: schema.businesses.place_id,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, baseSlug))
    .limit(1);
  if (existing.length === 0) return baseSlug;
  const row = existing[0];
  // Same place_id, same business: keep the existing slug, update in place.
  if (row.place_id && row.place_id === placeId) {
    return baseSlug;
  }
  if (row.source === "curated") {
    throw new Error(
      `slug collision with curated business "${baseSlug}". Refusing to overwrite. Flag for manual review.`,
    );
  }
  // Apify-source collision with a different place_id: append a suffix.
  const suffix = placeId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  return `${baseSlug}-${suffix}`;
}

interface PlaceIdScrapePlan {
  placeId: string;
  url: string;
  body: Record<string, unknown>;
  expectedSteps: string[];
}

function buildScrapePlan(placeId: string): PlaceIdScrapePlan {
  return {
    placeId,
    url: `${APIFY_BASE}/acts/${APIFY_GMAPS_ACTOR}/runs`,
    body: {
      placeIds: [placeId],
      maxReviews: 15,
      language: "en",
      maxImages: 20,
      includeWebResults: false,
      scrapePlaceDetailPage: true,
    },
    expectedSteps: [
      "POST run with payload",
      "poll /actor-runs/<id> with backoff (5s, 10s, 20s, 30s, then 30s up to 5 min)",
      "fetch dataset items, expect ONE record",
      "validate (skip if permanentlyClosed=true or core fields missing)",
      "normalize via lib/data/normalize.ts",
      "resolve slug collision against businesses table (curated => skip + flag)",
      "insert businesses row (source=apify), upsert business_photos and business_reviews",
      "stepPhotosUploaded -> uploadPhotoToBlob (graceful if BLOB_READ_WRITE_TOKEN missing)",
      "stepScored, stepAnalyzed",
    ],
  };
}

interface ScrapedToLegacy {
  legacy: LegacyBusinessFile;
  artifact: NormalizedArtifact;
}

/**
 * Run the Apify scrape for a single place_id and convert the result into
 * the LegacyBusinessFile shape that the rest of the pipeline already
 * consumes. Writes the businesses row + business_photos + business_reviews
 * to DB on the way through. Returns null if the place is permanently closed
 * or essential fields are missing (and flags needs_review).
 */
async function scrapePlaceIdToLegacy(
  placeId: string,
): Promise<ScrapedToLegacy | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_TOKEN not set in environment. Add it to .env.local before running --place-id in live mode. Use --dry-run to validate without calling Apify.",
    );
  }
  console.log(`[scrape] place_id=${placeId}: starting Apify run`);
  const runId = await startApifyRun(placeId, token);
  console.log(`[scrape] place_id=${placeId}: run id=${runId}`);
  const { datasetId, costUsd } = await waitForApifyRun(runId, token);
  console.log(
    `[scrape] place_id=${placeId}: dataset=${datasetId} apify_cost=$${costUsd.toFixed(3)}`,
  );
  const items = await fetchApifyDataset(datasetId, token);
  if (items.length === 0) {
    throw new Error(
      `Apify returned 0 items for place_id=${placeId}. The actor may not have indexed this place; verify the id manually.`,
    );
  }
  const raw = items[0] as Record<string, unknown>;
  if (raw.permanentlyClosed === true) {
    console.log(
      `[scrape] place_id=${placeId}: permanentlyClosed, skipping (no analyze spend)`,
    );
    return null;
  }
  if (
    !isInPittsburghMetro({
      postalCode:
        typeof raw.postalCode === "string" ? raw.postalCode : null,
      state: typeof raw.state === "string" ? raw.state : null,
      address: typeof raw.address === "string" ? raw.address : null,
    })
  ) {
    console.log(
      `[scrape] place_id=${placeId}: out of Pittsburgh metro (state=${String(raw.state)}, postalCode=${String(raw.postalCode)}), skipping (no analyze spend)`,
    );
    return null;
  }
  if (
    isChain({
      name: typeof raw.title === "string" ? raw.title : null,
      additionalInfo: raw.additionalInfo,
    })
  ) {
    console.log(
      `[scrape] place_id=${placeId}: chain detected ("${raw.title}"), skipping (no analyze spend)`,
    );
    return null;
  }
  if (!raw.title || !raw.address) {
    const reason = `essential fields missing for place_id=${placeId} (title=${raw.title ? "yes" : "no"}, address=${raw.address ? "yes" : "no"})`;
    console.warn(`[scrape] ${reason}`);
    await flagNeedsReviewLoose(`apify:${placeId}`, reason);
    return null;
  }

  const artifact = normalizeApifyRecordWithMeta(raw);
  if (!artifact) {
    const reason = `normalizer rejected place_id=${placeId} (likely category did not map to our enum)`;
    console.warn(`[scrape] ${reason}`);
    await flagNeedsReviewLoose(`apify:${placeId}`, reason);
    return null;
  }

  // Resolve slug collisions before any DB writes.
  const resolvedSlug = await resolveSlugForNewBusiness(
    artifact.business.slug,
    artifact.meta.placeId,
  );
  if (resolvedSlug !== artifact.business.slug) {
    console.log(
      `[scrape] place_id=${placeId}: slug "${artifact.business.slug}" collided, using "${resolvedSlug}"`,
    );
    artifact.business.slug = resolvedSlug;
  }

  const slug = artifact.business.slug;
  const { db, schema } = await getDb();

  // Upsert businesses row first so FK references resolve.
  await db
    .insert(schema.businesses)
    .values({
      slug,
      name: artifact.business.name,
      category: artifact.business.category,
      neighborhood: artifact.business.neighborhood,
      address: artifact.business.address,
      website: artifact.business.website ?? null,
      instagram: artifact.business.instagram ?? null,
      tiktok: artifact.business.tiktok ?? null,
      lat: null,
      lng: null,
      place_id: artifact.meta.placeId,
      hero_photo: artifact.business.hero_photo ?? null,
      claimed: false,
      owner_email: null,
      source: "apify",
    })
    .onConflictDoUpdate({
      target: schema.businesses.slug,
      set: {
        name: artifact.business.name,
        category: artifact.business.category,
        neighborhood: artifact.business.neighborhood,
        address: artifact.business.address,
        website: artifact.business.website ?? null,
        place_id: artifact.meta.placeId,
        hero_photo: artifact.business.hero_photo ?? null,
        updated_at: new Date(),
      },
    });

  // Upsert business_signals row. Carries the rich Apify metadata that the
  // page rendering depends on (verdict card, AtAGlance peer comparisons,
  // rich meta block via loadLegacyMeta DB-fallback path). Phase 7 batch
  // ingest used to skip this entirely, leaving 1,992 businesses with no
  // signals row and degenerate page rendering. Keep parity with the
  // schema added in migration 0006_flimsy_thunderball.sql.
  const signalsRow = {
    business_slug: slug,
    issue_slug: DEFAULT_ISSUE_SLUG,
    google_rating: artifact.business.google_rating ?? null,
    google_review_count: artifact.business.google_review_count ?? null,
    review_freshness_days: artifact.business.review_freshness_days ?? null,
    posts_last_30: artifact.business.posts_last_30 ?? null,
    reels_last_30: artifact.business.reels_last_30 ?? null,
    has_booking_link: artifact.business.has_booking_link ?? null,
    has_ugc_visible: artifact.business.has_ugc_visible ?? null,
    primary_category_name: artifact.meta.categoryName || null,
    images_count: artifact.meta.imagesCount ?? null,
    image_categories:
      artifact.meta.imageCategories && artifact.meta.imageCategories.length > 0
        ? artifact.meta.imageCategories
        : null,
    from_the_business_flags:
      artifact.meta.fromTheBusinessFlags &&
      artifact.meta.fromTheBusinessFlags.length > 0
        ? artifact.meta.fromTheBusinessFlags
        : null,
    has_phone: artifact.meta.hasPhone ?? null,
    has_opening_hours: artifact.meta.hasOpeningHours ?? null,
    claim_this_business: artifact.meta.claimThisBusiness ?? null,
    reviews_distribution: artifact.meta.reviewsDistribution ?? null,
  };
  await db
    .insert(schema.businessSignals)
    .values(signalsRow)
    .onConflictDoUpdate({
      target: [
        schema.businessSignals.business_slug,
        schema.businessSignals.issue_slug,
      ],
      set: {
        google_rating: signalsRow.google_rating,
        google_review_count: signalsRow.google_review_count,
        review_freshness_days: signalsRow.review_freshness_days,
        primary_category_name: signalsRow.primary_category_name,
        images_count: signalsRow.images_count,
        image_categories: signalsRow.image_categories,
        from_the_business_flags: signalsRow.from_the_business_flags,
        has_phone: signalsRow.has_phone,
        has_opening_hours: signalsRow.has_opening_hours,
        claim_this_business: signalsRow.claim_this_business,
        reviews_distribution: signalsRow.reviews_distribution,
        scraped_at: new Date(),
      },
    });

  // Upsert review rows. Existing rows for the slug get replaced by deleting
  // first; this is the simplest idempotent path until we track per-review
  // identity.
  await db
    .delete(schema.businessReviews)
    .where(eq(schema.businessReviews.business_slug, slug));
  if (artifact.meta.reviewTexts.length > 0) {
    await db.insert(schema.businessReviews).values(
      artifact.meta.reviewTexts.map((text) => ({
        business_slug: slug,
        text,
        rating: null,
        language: "en",
        posted_at: null,
      })),
    );
  }

  // Build the LegacyBusinessFile shape the existing pipeline consumes. The
  // "score" placeholder is a deterministic neutral default; stepScored
  // overwrites with real values immediately. We keep this lean rather than
  // computing rank-of-N here because rank context is built from the family
  // peer JSONs (Phase 1 carryover) and the new business is not yet ranked.
  const nowIso = new Date().toISOString();
  const placeholderScore: Score = {
    business_slug: slug,
    issue_slug: DEFAULT_ISSUE_SLUG,
    subscores: {
      content_canvas: 0,
      community_spark: 0,
      conversion_path: 0,
      momentum: 0,
      collab_fit: 0,
    },
    composite: 0,
    tier: "neighborhood_staples",
    rank_category: 1,
    rank_neighborhood: 1,
    rank_overall: 1,
    movement: { category: null, neighborhood: null, overall: null },
    unfair_advantage: { label: "TBD", evidence: "TBD" },
    scored_at: nowIso,
  };

  const legacy: LegacyBusinessFile = {
    slug,
    business: artifact.business,
    score: placeholderScore,
    meta: {
      placeId: artifact.meta.placeId,
      categoryName: artifact.meta.categoryName,
      imagesCount: artifact.meta.imagesCount,
      imageCategories: artifact.meta.imageCategories,
      fromTheBusinessFlags: artifact.meta.fromTheBusinessFlags,
      hasWebsite: artifact.meta.hasWebsite,
      hasPhone: artifact.meta.hasPhone,
      hasOpeningHours: artifact.meta.hasOpeningHours,
      claimThisBusiness: artifact.meta.claimThisBusiness,
      reviewsDistribution: artifact.meta.reviewsDistribution,
      reviewTexts: artifact.meta.reviewTexts,
      keywordPhrases: artifact.meta.keywordPhrases,
    },
  };

  return { legacy, artifact };
}

/**
 * Best-effort needs_review writer for cases where we don't have a slug yet
 * (validation fails before the businesses row exists). The schema requires
 * a FK to businesses.slug, so this swallows FK-violation errors and only
 * logs to console. Pipeline continues.
 */
async function flagNeedsReviewLoose(
  pseudoSlug: string,
  reason: string,
): Promise<void> {
  console.warn(`[needs_review] ${pseudoSlug}: ${reason}`);
  // Intentionally do NOT attempt a DB insert here; the FK on
  // needs_review.business_slug would reject "apify:<pid>". Console-only
  // surface is good enough; the batch summary also reports flagged counts.
}

/**
 * Persist the photo set for a freshly scraped business. Each photo is run
 * through uploadPhotoToBlob; null returns mean we keep the source URL on
 * business_photos.url with blob_key=null. Idempotent: we delete and replace
 * the photo set per business slug.
 */
async function persistPhotosForArtifact(
  artifact: NormalizedArtifact,
): Promise<{ uploaded: number; total: number }> {
  const slug = artifact.business.slug;
  const { db, schema } = await getDb();
  await db
    .delete(schema.businessPhotos)
    .where(eq(schema.businessPhotos.business_slug, slug));
  let uploaded = 0;
  const photos = artifact.business.photos;
  for (let i = 0; i < photos.length; i += 1) {
    const p = photos[i];
    const result = await uploadPhotoToBlob(p.url, slug, i);
    const finalUrl = result.sizes.w800 ?? result.sizes.w1600 ?? p.url;
    await db.insert(schema.businessPhotos).values({
      business_slug: slug,
      url: finalUrl,
      blob_key: result.blob_key,
      source: p.source,
      sort_order: i,
    });
    if (result.blob_key) uploaded += 1;
  }
  return { uploaded, total: photos.length };
}

/* ---------------- step 1 (alternate): scraped from Apify ---------------- */

/**
 * --place-id variant of stepScraped. Reuses the checkpoint table so a
 * mid-batch crash doesn't waste Apify spend on a re-run.
 */
async function stepScrapedFromApify(
  placeId: string,
  flags: Flags,
): Promise<ScrapedToLegacy | null> {
  // We don't yet know the slug, so we use a synthetic checkpoint key. This
  // is a no-op write, the real ingest_runs entry happens once we know the
  // real slug; keep the per-step structure here for log symmetry.
  console.log(`[scraped] place_id=${placeId}: start (Apify path)`);
  if (flags.dryRun) {
    const plan = buildScrapePlan(placeId);
    console.log("Planned Apify call:");
    console.log(`  POST ${plan.url}?token=<APIFY_TOKEN>`);
    console.log(`  body: ${JSON.stringify(plan.body)}`);
    console.log("  expected steps:");
    for (const s of plan.expectedSteps) console.log(`    - ${s}`);
    console.log(
      `[scraped] place_id=${placeId}: dry-run, no Apify call, no DB writes`,
    );
    return null;
  }
  const result = await scrapePlaceIdToLegacy(placeId);
  if (!result) return null;
  const slug = result.legacy.slug;
  await checkpointWritePending(slug, "scraped");
  await checkpointWriteSuccess(slug, "scraped");
  logComplete(
    "scraped",
    slug,
    `${result.legacy.meta?.reviewTexts?.length ?? 0} reviews, ${result.artifact.business.photos.length} photos`,
  );
  return result;
}

/* ---------------- step 2 (alternate): photos with blob upload ----------- */

async function stepPhotosUploadedForArtifact(
  artifact: NormalizedArtifact,
  flags: Flags,
): Promise<void> {
  const slug = artifact.business.slug;
  logStart("photos_uploaded", slug);
  const decision = flags.dryRun
    ? { run: true, reason: "dry-run" }
    : await checkpointShouldRun(slug, "photos_uploaded", flags);
  if (!decision.run) {
    logSkipped("photos_uploaded", slug, decision.reason);
    return;
  }
  if (flags.dryRun) {
    logComplete(
      "photos_uploaded",
      slug,
      `dry-run, would upload ${artifact.business.photos.length} photo(s) via uploadPhotoToBlob`,
    );
    return;
  }
  await checkpointWritePending(slug, "photos_uploaded");
  try {
    const { uploaded, total } = await persistPhotosForArtifact(artifact);
    await checkpointWriteSuccess(slug, "photos_uploaded");
    logComplete(
      "photos_uploaded",
      slug,
      `${uploaded}/${total} blobs uploaded${
        uploaded < total ? " (rest stored as source URL)" : ""
      }`,
    );
  } catch (e) {
    const msg = (e as Error).message;
    await checkpointWriteFailed(slug, "photos_uploaded", msg);
    logFailed("photos_uploaded", slug, msg);
    throw e;
  }
}

/* --------------------------- run-place-id ------------------------------- */

async function runPlaceId(placeId: string, flags: Flags): Promise<void> {
  console.log(
    `\n=== ingest-one place_id=${placeId} mode=${
      flags.dryRun ? "dry-run" : "live"
    } ===`,
  );

  // Idempotent re-runs: if a business already exists with this place_id,
  // print and exit 0.
  if (!flags.dryRun) {
    const { db, schema } = await getDb();
    const existing = await db
      .select({ slug: schema.businesses.slug })
      .from(schema.businesses)
      .where(eq(schema.businesses.place_id, placeId))
      .limit(1);
    if (existing.length > 0) {
      console.log(
        `[place-id] place_id=${placeId} already ingested as ${existing[0].slug}. Re-runs are no-ops; pass --force on a --slug invocation to redo any step.`,
      );
      return;
    }
  } else {
    const plan = buildScrapePlan(placeId);
    console.log("Dry-run, no Apify call, no DB writes. Planned request:");
    console.log(`  POST ${plan.url}?token=<APIFY_TOKEN>`);
    console.log(`  body: ${JSON.stringify(plan.body, null, 2)}`);
    console.log("  expected pipeline steps:");
    for (const s of plan.expectedSteps) console.log(`    - ${s}`);
    return;
  }

  const scraped = await stepScrapedFromApify(placeId, flags);
  if (!scraped) {
    console.log(
      `[place-id] place_id=${placeId}: scrape produced no business (closed or invalid). See logs above.`,
    );
    return;
  }
  await stepPhotosUploadedForArtifact(scraped.artifact, flags);
  const scoreOut = await stepScored(
    scraped.legacy.slug,
    scraped.legacy,
    flags,
  );
  await stepAnalyzed(scraped.legacy.slug, scraped.legacy, flags);
  const usd = await readUsdSpentForSlug(scraped.legacy.slug);
  console.log(
    `\n[summary] ${scraped.legacy.slug}: tier=${scoreOut.tier} composite=${scoreOut.composite} usd_spent_total=$${usd.toFixed(4)} (lifetime ledger sum)`,
  );
}

/* ------------------------------ run-batch ------------------------------- */

interface QueueFile {
  category: string;
  place_ids: string[];
  notes?: string;
}

function loadQueueFile(category: string): QueueFile {
  const file = path.join(QUEUES_DIR, `${category}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Queue file not found: ${file}. Create it with shape { "category": "${category}", "place_ids": [...] } before running --batch.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as QueueFile;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.place_ids)) {
    throw new Error(
      `Queue file ${file} is malformed: expected { category, place_ids: string[] }`,
    );
  }
  return raw;
}

/**
 * Cumulative spend for the active session. We treat "session" as everything
 * logged on or after `sessionStart`, since the batch begins by recording
 * its own start time. Lifetime ledger sums are available via
 * readUsdSpentForSlug on the per-business summary line.
 */
async function readSessionSpend(sessionStart: Date): Promise<number> {
  try {
    const { db, schema } = await getDb();
    const rows = await db
      .select({ total: sum(schema.ingestCostLog.usd_cost) })
      .from(schema.ingestCostLog)
      .where(gte(schema.ingestCostLog.occurred_at, sessionStart));
    const raw = rows[0]?.total;
    if (raw === null || raw === undefined) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function runBatch(
  category: string,
  budget: number,
  flags: Flags,
): Promise<void> {
  console.log(
    `\n=== ingest-one --batch category=${category} budget=$${budget.toFixed(2)} mode=${
      flags.dryRun ? "dry-run" : "live"
    } ===`,
  );
  const queue = loadQueueFile(category);
  console.log(
    `[batch] queue file: content/queues/${category}.json (${queue.place_ids.length} place_id(s) listed)`,
  );

  if (flags.dryRun) {
    const projectedMax = queue.place_ids.length * ESTIMATED_NEXT_USD;
    console.log(
      `[batch] dry-run, would attempt up to ${queue.place_ids.length} business(es). Projected upper bound: $${projectedMax.toFixed(2)} of analyze spend (estimate=$${ESTIMATED_NEXT_USD.toFixed(2)} per call). Halt threshold: cumulative + $${ESTIMATED_NEXT_USD.toFixed(2)} > $${budget.toFixed(2)}.`,
    );
    if (queue.place_ids.length === 0) {
      console.log(
        `[batch] queue is empty. Anna populates content/queues/${category}.json with place_ids before running live.`,
      );
    } else {
      console.log(
        `[batch] sample place_id(s): ${queue.place_ids.slice(0, 3).join(", ")}${queue.place_ids.length > 3 ? ", ..." : ""}`,
      );
    }
    return;
  }

  const sessionStart = new Date();
  let succeeded = 0;
  let failed = 0;
  let flagged = 0;
  let halted = false;

  for (const placeId of queue.place_ids) {
    const cumulative = await readSessionSpend(sessionStart);
    if (cumulative + ESTIMATED_NEXT_USD > budget) {
      halted = true;
      console.log(
        `\nBUDGET CAP HIT. cumulative=$${cumulative.toFixed(4)} + estimated_next=$${ESTIMATED_NEXT_USD.toFixed(2)} > budget=$${budget.toFixed(2)}. Halting.`,
      );
      break;
    }
    try {
      await runPlaceId(placeId, flags);
      // Heuristic: if any needs_review row was written for this place_id's
      // resolved slug during this session, count as flagged. We don't have a
      // direct hook back from runPlaceId; do a cheap post-check.
      const newlyFlagged = await wasFlagged(placeId, sessionStart);
      if (newlyFlagged) flagged += 1;
      succeeded += 1;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(
        `[batch] place_id=${placeId}: failed, continuing. ${msg.slice(0, 300)}`,
      );
      failed += 1;
    }
  }

  const totalSpent = await readSessionSpend(sessionStart);
  const completedAttempts = succeeded + failed;
  const avg =
    completedAttempts > 0 ? totalSpent / completedAttempts : 0;
  console.log(
    `\n[batch summary] category=${category} succeeded=${succeeded} failed=${failed} flagged=${flagged} halted=${halted} usd_spent_session=$${totalSpent.toFixed(4)} avg_per_business=$${avg.toFixed(4)}`,
  );
}

async function wasFlagged(
  placeId: string,
  sessionStart: Date,
): Promise<boolean> {
  try {
    const { db, schema } = await getDb();
    const biz = await db
      .select({ slug: schema.businesses.slug })
      .from(schema.businesses)
      .where(eq(schema.businesses.place_id, placeId))
      .limit(1);
    if (biz.length === 0) return false;
    const rows = await db
      .select({ id: schema.needsReview.id })
      .from(schema.needsReview)
      .where(
        and(
          eq(schema.needsReview.business_slug, biz[0].slug),
          gt(schema.needsReview.created_at, sessionStart),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

/* -------------------------------- main ---------------------------------- */

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  // Phase 3 paths: scrape a brand-new business by Google place_id, or
  // sweep a queued category with a hard budget cap.
  if (flags.batch) {
    if (!flags.category) {
      console.error("--batch requires --category <slug>");
      process.exit(1);
    }
    if (flags.budget === null || !Number.isFinite(flags.budget) || flags.budget <= 0) {
      console.error(
        "--batch requires --budget <usd>, a positive number (e.g. --budget 15)",
      );
      process.exit(1);
    }
    await runBatch(flags.category, flags.budget, flags);
    return;
  }
  if (flags.placeId) {
    await runPlaceId(flags.placeId, flags);
    return;
  }

  if (!flags.slug) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/ingest-one.ts --slug <slug>\n" +
        "  npx tsx scripts/ingest-one.ts --slug <slug> --dry-run\n" +
        "  npx tsx scripts/ingest-one.ts --slug <slug> --resume\n" +
        "  npx tsx scripts/ingest-one.ts --slug <slug> --force\n" +
        "  npx tsx scripts/ingest-one.ts --place-id <pid>           (Phase 3 stub)\n" +
        "  npx tsx scripts/ingest-one.ts --batch --category <c> --budget <usd>  (Phase 3 stub)",
    );
    process.exit(1);
  }

  await runOne(flags.slug, flags);
}

main().catch((err) => {
  console.error("ingest-one failed:", (err as Error).message);
  process.exit(1);
});
