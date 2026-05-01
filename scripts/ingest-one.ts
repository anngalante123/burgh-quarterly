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
import { and, desc, eq, sum } from "drizzle-orm";
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
const DEFAULT_ISSUE_SLUG = "2026-spring";

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

/* -------------------------------- main ---------------------------------- */

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  // Phase 3 stubs first; both flags accepted, both immediately bail with a
  // clear "not yet" message so callers don't hit a half-implemented path.
  if (flags.placeId) {
    console.log(
      `[--place-id ${flags.placeId}] Phase 3 work; not yet implemented. The Apify-scrape path for new place_ids ships in Phase 3. Use --slug for existing businesses today.`,
    );
    return;
  }
  if (flags.batch) {
    console.log(
      `[--batch] Phase 3 work; not yet implemented. The category sweep with --budget halt-on-spend ships in Phase 3. Provided flags: category=${flags.category ?? "(none)"} budget=${flags.budget ?? "(none)"}`,
    );
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
