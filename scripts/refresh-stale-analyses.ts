#!/usr/bin/env tsx
/**
 * scripts/refresh-stale-analyses.ts
 *
 * Refresh STALE Claude analyses, the ones whose diagnosis/narrative text was
 * generated BEFORE the most recent rescore and therefore cites pre-rescore
 * ranks. This is distinct from `backfill-missing-analyses.ts`, which only
 * handles MISSING or empty-themes rows. This script targets rows that already
 * exist but are out of date.
 *
 * Staleness signal (clean and reliable):
 *   analyses.generated_at < scores.scored_at
 *   for the same (business_slug, issue_slug) on the active issue.
 *
 * Background: roughly 2,545 analyses rows were generated 2026-05-08/09, then a
 * full rescore on 2026-05-13 bumped scores.scored_at, leaving every one of
 * those analyses stale. The DEV_LOG mentions a scripts/reanalyze-all.sh that
 * never existed. This is the tool that replaces it.
 *
 * It REUSES the per-business analyze and upsert pipeline exported from
 * backfill-missing-analyses.ts (processSlug, loadScoredRowsForFamilyContext).
 * No analyze logic is duplicated here. The upsert is idempotent on
 * (business_slug, issue_slug), so the run is resumable: rerun it and it simply
 * re-refreshes whatever is still stale, overwriting in place.
 *
 * =====================================================================
 *  SAFETY: this script DEFAULTS TO DRY RUN. It makes ZERO API calls and
 *  ZERO writes unless you pass --execute. A real run costs money (Anthropic
 *  API) and writes to the analyses table. Do not pass --execute until the
 *  human has confirmed scoring has settled.
 * =====================================================================
 *
 * PRECONDITIONS before a real (--execute) run:
 *   1. Scoring code is committed and a rescore has actually landed
 *      (otherwise you refresh against ranks that are about to change again).
 *   2. Snapshot the analyses table first, so a bad run can be rolled back.
 *      (See scripts/snapshot-issue.ts or take a manual table copy.)
 *   3. ANTHROPIC_API_KEY is set and the account has credits.
 *
 * USAGE:
 *   npx tsx scripts/refresh-stale-analyses.ts                 (dry run, all tiers)
 *   npx tsx scripts/refresh-stale-analyses.ts --tier=icons,ones_to_watch
 *   npx tsx scripts/refresh-stale-analyses.ts --limit=50
 *   npx tsx scripts/refresh-stale-analyses.ts --cost-ceiling=40
 *   npx tsx scripts/refresh-stale-analyses.ts --execute       (REAL run, spends money)
 *   npx tsx scripts/refresh-stale-analyses.ts --help
 *
 * FLAGS:
 *   --tier=LIST       Comma-separated tiers to include. Valid: icons,
 *                     ones_to_watch, neighborhood_staples. Default: all three.
 *                     Use this to run cheaper-first: icons,ones_to_watch is
 *                     roughly 1,690 rows (about $34) before the larger
 *                     neighborhood_staples tier.
 *   --limit=N         Process at most N stale rows (after tier filter,
 *                     ordered by business_slug for stable resumability).
 *   --cost-ceiling=N  Abort before any API calls if the estimated cost in USD
 *                     exceeds N. Default: 60. Estimate is about $0.02/business.
 *   --force           REQUIRED for most rows to actually re-run. About 1,285
 *                     stale businesses sit behind a `success` ingest checkpoint;
 *                     the canonical ingest path SKIPS those unless --force is
 *                     passed. This script's own upsert does not consult the
 *                     checkpoint, but pass --force so behavior stays consistent
 *                     with the rest of the pipeline and so a future switch to
 *                     the checkpointed path does not silently skip them.
 *   --execute         Leave dry-run mode and actually call the API and write.
 *                     Without this flag the script NEVER calls the API and
 *                     NEVER writes. Default is dry-run.
 *   --help            Print this help and exit.
 *
 * COST: about $0.02 per business at Sonnet 4.6 pricing with prompt caching warm.
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "drizzle-orm";

import {
  ISSUE_SLUG,
  RATE_LIMIT_MS,
  USD_PER_BUSINESS,
  loadScoredRowsForFamilyContext,
  processSlug,
  sleep,
} from "@/scripts/backfill-missing-analyses";

const VALID_TIERS = ["icons", "ones_to_watch", "neighborhood_staples"] as const;
type Tier = (typeof VALID_TIERS)[number];

const DEFAULT_COST_CEILING_USD = 60;
const SAMPLE_SIZE = 10;

const HELP = `
refresh-stale-analyses.ts

Refresh STALE Claude analyses for issue "${ISSUE_SLUG}". Stale means
analyses.generated_at < scores.scored_at for the same business and issue.

SAFETY: defaults to DRY RUN. Zero API calls, zero writes unless you pass
--execute. A real run costs money and writes to the analyses table.

Preconditions for a real run:
  1. Scoring committed and a rescore has landed.
  2. Snapshot the analyses table first (rollback point).
  3. ANTHROPIC_API_KEY set with credits.

Flags:
  --tier=LIST       icons, ones_to_watch, neighborhood_staples (comma list).
                    Default: all. Run cheaper-first with icons,ones_to_watch.
  --limit=N         Process at most N stale rows (ordered by business_slug).
  --cost-ceiling=N  Abort before any API calls if estimate (USD) exceeds N.
                    Default: ${DEFAULT_COST_CEILING_USD}. About $${USD_PER_BUSINESS.toFixed(
  2,
)}/business.
  --force           Re-run rows behind a "success" ingest checkpoint. About
                    1,285 stale rows need this to not be skipped by the
                    canonical ingest path. Pass it for consistency.
  --execute         Leave dry-run and actually spend money plus write. Default
                    is dry-run.
  --help            Show this help.

Examples:
  npx tsx scripts/refresh-stale-analyses.ts
  npx tsx scripts/refresh-stale-analyses.ts --tier=icons,ones_to_watch
  npx tsx scripts/refresh-stale-analyses.ts --limit=50 --cost-ceiling=2
`;

function parseTiers(argv: string[]): Tier[] {
  const arg = argv.find((a) => a.startsWith("--tier="));
  if (!arg) return [...VALID_TIERS];
  const raw = arg.slice("--tier=".length);
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const invalid = parts.filter((p) => !VALID_TIERS.includes(p as Tier));
  if (invalid.length > 0) {
    console.error(
      `[refresh] invalid tier(s): ${invalid.join(", ")}. ` +
        `Valid: ${VALID_TIERS.join(", ")}`,
    );
    process.exit(2);
  }
  if (parts.length === 0) return [...VALID_TIERS];
  return parts as Tier[];
}

function parseNumberFlag(
  argv: string[],
  name: string,
  fallback: number | null,
): number | null {
  const arg = argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const raw = arg.slice(`--${name}=`.length);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`[refresh] --${name} must be a positive number, got "${raw}"`);
    process.exit(2);
  }
  return n;
}

type StaleRow = { slug: string; tier: Tier };

/**
 * Read-only. Returns every stale (business_slug, tier) for the active issue,
 * filtered to the requested tiers, ordered by business_slug for stable
 * resumability. Makes a single SELECT, no writes.
 */
async function loadStaleRows(tiers: Tier[]): Promise<StaleRow[]> {
  const { db, schema } = await import("@/lib/db/client");
  const result = await db.execute(sql`
    SELECT a.business_slug AS slug, s.tier AS tier
    FROM ${schema.analyses} a
    JOIN ${schema.scores} s
      ON s.business_slug = a.business_slug
      AND s.issue_slug = a.issue_slug
    WHERE a.issue_slug = ${ISSUE_SLUG}
      AND a.generated_at < s.scored_at
      AND s.tier = ANY(${sql.raw(`ARRAY[${tiers.map((t) => `'${t}'`).join(",")}]::tier[]`)})
    ORDER BY a.business_slug
  `);
  // neon-http returns a plain array; guard for the {rows} shape too.
  const rows =
    (result as unknown as { rows?: { slug: string; tier: Tier }[] }).rows ??
    (result as unknown as { slug: string; tier: Tier }[]);
  return rows.map((r) => ({ slug: r.slug, tier: r.tier }));
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }

  const execute = argv.includes("--execute");
  const dryRun = !execute;
  const force = argv.includes("--force");
  const tiers = parseTiers(argv);
  const limit = parseNumberFlag(argv, "limit", null);
  const costCeiling =
    parseNumberFlag(argv, "cost-ceiling", DEFAULT_COST_CEILING_USD) ??
    DEFAULT_COST_CEILING_USD;

  if (!process.env.DATABASE_URL) {
    console.error("[refresh] DATABASE_URL not set");
    process.exit(1);
  }
  // API key is only needed for a real run. Dry run never touches the API.
  if (execute && !process.env.ANTHROPIC_API_KEY) {
    console.error("[refresh] --execute requires ANTHROPIC_API_KEY (with credits)");
    process.exit(1);
  }

  console.log(`\n[refresh] issue: ${ISSUE_SLUG}`);
  console.log(`[refresh] mode: ${dryRun ? "DRY RUN (no API, no writes)" : "EXECUTE"}`);
  console.log(`[refresh] tiers: ${tiers.join(", ")}`);
  console.log(`[refresh] force: ${force ? "yes" : "no"}`);
  if (limit !== null) console.log(`[refresh] limit: ${limit}`);
  console.log(`[refresh] cost ceiling: $${costCeiling.toFixed(2)}`);

  // ----- Target selection (read-only) -----
  // Always compute the full stale set across ALL tiers first, so we can print
  // an honest total and a per-tier breakdown regardless of the --tier filter.
  const allStale = await loadStaleRows([...VALID_TIERS]);
  const breakdown: Record<Tier, number> = {
    icons: 0,
    ones_to_watch: 0,
    neighborhood_staples: 0,
  };
  for (const r of allStale) breakdown[r.tier] += 1;

  console.log(`\n[refresh] total STALE rows (all tiers): ${allStale.length}`);
  console.log(`[refresh]   icons:                ${breakdown.icons}`);
  console.log(`[refresh]   ones_to_watch:        ${breakdown.ones_to_watch}`);
  console.log(`[refresh]   neighborhood_staples: ${breakdown.neighborhood_staples}`);
  console.log(
    `[refresh]   icons + ones_to_watch subset: ${breakdown.icons + breakdown.ones_to_watch}`,
  );

  // Apply the tier filter, then the limit.
  let targets = allStale.filter((r) => tiers.includes(r.tier));
  const afterTier = targets.length;
  if (limit !== null) targets = targets.slice(0, limit);

  console.log(`\n[refresh] after tier filter: ${afterTier}`);
  if (limit !== null) console.log(`[refresh] after limit: ${targets.length}`);

  if (targets.length === 0) {
    console.log("\n[refresh] nothing to refresh for this selection. exiting.");
    return;
  }

  const estimatedCost = targets.length * USD_PER_BUSINESS;
  console.log(
    `[refresh] estimated cost: ~$${estimatedCost.toFixed(2)} ` +
      `(${targets.length} x $${USD_PER_BUSINESS.toFixed(2)})`,
  );

  if (estimatedCost > costCeiling) {
    console.error(
      `[refresh] estimated cost $${estimatedCost.toFixed(2)} exceeds ceiling ` +
        `$${costCeiling.toFixed(2)}. Aborting. Raise --cost-ceiling or narrow ` +
        `--tier / --limit.`,
    );
    process.exit(3);
  }

  // ----- Sample of slugs that WOULD process -----
  const sample = targets.slice(0, SAMPLE_SIZE);
  console.log(`\n[refresh] first ${sample.length} slug(s) that would process:`);
  sample.forEach((r, i) => console.log(`  ${i + 1}. ${r.slug} (${r.tier})`));

  // ----- Dry run stops here, having made zero API calls and zero writes -----
  if (dryRun) {
    console.log(
      `\n[refresh] DRY RUN, no API calls and no writes were made. ` +
        `${targets.length} row(s) would be refreshed. ` +
        `Pass --execute to actually run (this spends money).`,
    );
    return;
  }

  // ----- Real run (only reachable with --execute) -----
  console.log(`\n[refresh] EXECUTE: refreshing ${targets.length} stale row(s)...`);
  const allScoredRows = await loadScoredRowsForFamilyContext();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { slug: string; reason: string }[] = [];

  for (let i = 0; i < targets.length; i++) {
    const { slug, tier } = targets[i];
    const label = `[${i + 1}/${targets.length}] ${slug} (${tier})`;
    try {
      const res = await processSlug(client, slug, allScoredRows);
      if (res.status === "skip") {
        console.log(`${label} ... SKIP (${res.reason})`);
        failures.push({ slug, reason: res.reason });
        skipped++;
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
    if (i < targets.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log("\n========== REFRESH SUMMARY ==========");
  console.log(`processed: ${processed}`);
  console.log(`skipped:   ${skipped}`);
  console.log(`failed:    ${failed}`);
  if (failures.length > 0) {
    console.log("\nfailures / skips:");
    failures.forEach((f) => console.log(`  - ${f.slug}: ${f.reason}`));
  }
  console.log("=====================================\n");
}

main().catch((e) => {
  console.error("[refresh] fatal:", e);
  process.exit(1);
});
