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
  status: "pending" | "success" | "failed";
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

const SWEETS = new Set([
  "Bakery",
  "Pastry shop",
  "Dessert shop",
  "Dessert restaurant",
  "Ice cream shop",
]);
const CAFES = new Set(["Cafe", "Coffee shop", "Tea house", "Juice shop"]);
const ASIAN = new Set([
  "Noodle shop",
  "Japanese restaurant",
  "Sushi restaurant",
  "Thai restaurant",
  "Indian restaurant",
]);
const BARS = new Set(["Bar", "Brewery"]);

function family(categoryName: string): { key: string; label: string } {
  if (SWEETS.has(categoryName))
    return { key: "sweets", label: "Pittsburgh Sweets" };
  if (CAFES.has(categoryName))
    return { key: "cafes", label: "Pittsburgh Cafes" };
  if (ASIAN.has(categoryName))
    return { key: "asian", label: "Pittsburgh Asian Kitchens" };
  if (BARS.has(categoryName)) return { key: "bars", label: "Pittsburgh Bars" };
  return { key: "other", label: "Pittsburgh Businesses" };
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = vals.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m];
}

interface FamilyContext {
  fam: { key: string; label: string };
  rank: number;
  size: number;
  leaderName: string;
  leaderAdvantage: string;
  peerMedians: Record<string, number>;
}

function buildFamilyContext(target: LegacyBusinessFile): FamilyContext {
  // Read every business JSON on disk to compute family rank + medians. This
  // matches what scripts/analyze-business.ts does today; once Phase 3 batch
  // ingestion lands we'll move family stats into a DB precompute.
  const allFiles = fs
    .readdirSync(BUSINESSES_DIR)
    .filter((f) => f.endsWith(".json"));
  const all: Array<{ slug: string; meta: LegacyBusinessFile }> = [];
  for (const f of allFiles) {
    const slug = f.replace(/\.json$/, "");
    try {
      const parsed = loadBusinessFile(slug);
      if (parsed) all.push({ slug, meta: parsed });
    } catch {
      // skip un-parseable peers; one busted file shouldn't kill the run
    }
  }
  const targetCat = target.meta?.categoryName ?? "";
  const fam = family(targetCat);
  const sameFamily = all.filter(
    (b) => family(b.meta.meta?.categoryName ?? "").key === fam.key,
  );
  const ranked = [...sameFamily].sort(
    (a, b) => b.meta.score.composite - a.meta.score.composite,
  );
  const rank = ranked.findIndex((b) => b.slug === target.slug) + 1;
  const leader = ranked[0]?.meta;
  const peerMedians: Record<string, number> = {
    content_canvas: median(
      sameFamily.map((b) => b.meta.score.subscores.content_canvas),
    ),
    community_spark: median(
      sameFamily.map((b) => b.meta.score.subscores.community_spark),
    ),
    conversion_path: median(
      sameFamily.map((b) => b.meta.score.subscores.conversion_path),
    ),
    momentum: median(sameFamily.map((b) => b.meta.score.subscores.momentum)),
    collab_fit: median(
      sameFamily.map((b) => b.meta.score.subscores.collab_fit),
    ),
  };
  return {
    fam,
    rank: rank > 0 ? rank : 1,
    size: sameFamily.length,
    leaderName: leader?.business.name ?? target.business.name,
    leaderAdvantage: leader?.score.unfair_advantage.label ?? "",
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
    const parsed = loadBusinessFile(slug);
    if (!parsed)
      throw new Error(
        `[scraped] ${slug}: no content/businesses/${slug}.json on disk and no DB fallback yet (Phase 3 work).`,
      );
    return parsed;
  }
  if (!flags.dryRun) await checkpointWritePending(slug, "scraped");
  try {
    const parsed = loadBusinessFile(slug);
    if (!parsed) {
      throw new Error(
        `no content/businesses/${slug}.json on disk. For new place_ids, the Apify scrape path is Phase 3 work.`,
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
    if (!flags.dryRun) await checkpointWriteFailed(slug, "analyzed", msg);
    logFailed("analyzed", slug, msg);
    throw new Error(msg);
  }

  const social = loadSocialFile(slug);
  const ctx = buildFamilyContext(parsed);

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
 * Resolve slug collisions for a brand-new scrape by appending a short
 * suffix based on the placeId. Curated-source collisions short-circuit:
 * if the existing row has source='curated', we refuse to clobber it and
 * raise so the caller can flag for review and skip.
 */
async function resolveSlugForNewBusiness(
  baseSlug: string,
  placeId: string,
): Promise<string> {
  const { db, schema } = await getDb();
  const existing = await db
    .select({ slug: schema.businesses.slug, source: schema.businesses.source })
    .from(schema.businesses)
    .where(eq(schema.businesses.slug, baseSlug))
    .limit(1);
  if (existing.length === 0) return baseSlug;
  const row = existing[0];
  if (row.source === "curated") {
    throw new Error(
      `slug collision with curated business "${baseSlug}". Refusing to overwrite. Flag for manual review.`,
    );
  }
  // Apify-source collision: append a placeId-derived suffix.
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
      `[scrape] place_id=${placeId}: permanentlyClosed, skipping`,
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
