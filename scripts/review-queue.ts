#!/usr/bin/env tsx
/**
 * scripts/review-queue.ts
 *
 * Read-side CLI for the needs_review table. The QA sweep in
 * scripts/ingest-one.ts writes a row whenever an analyzed business trips a
 * forbidden phrase, an em-dash leak, or a structural shape problem. This
 * script is the human-in-the-loop gate, prints the queue grouped by reason
 * and lets Anna mark rows resolved as she fixes the underlying prompt or
 * data issue.
 *
 * Usage:
 *   npx tsx scripts/review-queue.ts                            # list all unresolved
 *   npx tsx scripts/review-queue.ts --issue 2026-spring        # filter (best-effort)
 *   npx tsx scripts/review-queue.ts --resolve 42               # mark row id=42 resolved
 *   npx tsx scripts/review-queue.ts --resolve-all-banned-words # convenience batch resolve
 *
 * Notes:
 *   1. needs_review does not have an issue_slug column today (Phase 1
 *      schema). The --issue flag filters by the reason text containing the
 *      issue slug, which is a best-effort match. If we add a column later,
 *      this script picks it up.
 *   2. No em-dashes anywhere. Project rule.
 *   3. Read-only without --resolve / --resolve-all-banned-words. Safe to
 *      run anytime.
 */

import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import { and, eq, isNull, sql } from "drizzle-orm";

type DbModule = typeof import("@/lib/db/client");
let _dbMod: DbModule | null = null;
async function getDb(): Promise<DbModule> {
  if (_dbMod) return _dbMod;
  _dbMod = await import("@/lib/db/client");
  return _dbMod;
}

interface Flags {
  issue: string | null;
  resolveId: number | null;
  resolveAllBannedWords: boolean;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    issue: null,
    resolveId: null,
    resolveAllBannedWords: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--issue") {
      flags.issue = next ?? null;
      i += 1;
    } else if (arg === "--resolve") {
      const n = next ? Number(next) : NaN;
      if (!Number.isFinite(n) || n <= 0) {
        console.error(
          `--resolve expects a positive integer id, got ${JSON.stringify(next)}`,
        );
        process.exit(1);
      }
      flags.resolveId = n;
      i += 1;
    } else if (arg === "--resolve-all-banned-words") {
      flags.resolveAllBannedWords = true;
    } else if (arg.startsWith("--issue=")) {
      flags.issue = arg.slice("--issue=".length);
    } else if (arg.startsWith("--resolve=")) {
      const n = Number(arg.slice("--resolve=".length));
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`--resolve expects a positive integer id`);
        process.exit(1);
      }
      flags.resolveId = n;
    }
  }
  return flags;
}

/**
 * Group reasons under a coarser bucket so the listing is readable. The
 * reason text is the source of truth, the bucket is a display nicety.
 */
function bucketFor(reason: string): string {
  const r = reason.toLowerCase();
  if (r.startsWith("forbidden phrase:")) {
    const m = reason.match(/forbidden phrase:\s*"([^"]+)"/i);
    return m ? `Banned phrase: ${m[1]}` : "Banned phrase";
  }
  if (r.includes("em-dash")) return "Em-dash leak";
  if (r.includes("themes returned")) return "Theme count too low";
  if (r.includes("quarter_narrative")) return "Narrative too short";
  if (r.includes("highlight")) return "Pull-quote highlight mismatch";
  return "Other";
}

function isBannedWordReason(reason: string): boolean {
  return reason.toLowerCase().startsWith("forbidden phrase:");
}

function relativeDays(d: Date): string {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) {
    const hrs = Math.floor(ms / 3_600_000);
    if (hrs <= 0) return "just now";
    return `${hrs}h ago`;
  }
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  return `${months} months ago`;
}

async function listUnresolved(flags: Flags): Promise<void> {
  const { db, schema } = await getDb();
  const where = flags.issue
    ? and(
        isNull(schema.needsReview.resolved_at),
        sql`${schema.needsReview.reason} ILIKE ${"%" + flags.issue + "%"}`,
      )
    : isNull(schema.needsReview.resolved_at);

  const rows = await db
    .select({
      id: schema.needsReview.id,
      business_slug: schema.needsReview.business_slug,
      reason: schema.needsReview.reason,
      created_at: schema.needsReview.created_at,
    })
    .from(schema.needsReview)
    .where(where)
    .orderBy(schema.needsReview.created_at);

  if (rows.length === 0) {
    console.log(
      flags.issue
        ? `No unresolved review-queue rows match --issue=${flags.issue}.`
        : "No unresolved review-queue rows. Pipeline output is clean.",
    );
    return;
  }

  const groups = new Map<
    string,
    Array<{
      id: number;
      slug: string;
      detail: string;
      created_at: Date;
    }>
  >();
  for (const row of rows) {
    const bucket = bucketFor(row.reason);
    const arr = groups.get(bucket) ?? [];
    arr.push({
      id: row.id,
      slug: row.business_slug,
      detail: row.reason,
      created_at: row.created_at,
    });
    groups.set(bucket, arr);
  }

  console.log(
    `\nReview queue (${rows.length} unresolved row${rows.length === 1 ? "" : "s"})${
      flags.issue ? ` matching ${flags.issue}` : ""
    }:\n`,
  );
  const sortedGroups = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [bucket, items] of sortedGroups) {
    console.log(`== ${bucket} (${items.length}) ==`);
    for (const it of items) {
      console.log(
        `  [#${it.id}] ${it.slug} . ${it.detail} . created ${relativeDays(it.created_at)}`,
      );
    }
    console.log("");
  }
  console.log(
    "Tip: resolve a row with `npx tsx scripts/review-queue.ts --resolve <id>`. " +
      "Resolve all banned-phrase rows at once with --resolve-all-banned-words.",
  );
}

async function resolveOne(id: number): Promise<void> {
  const { db, schema } = await getDb();
  const result = await db
    .update(schema.needsReview)
    .set({ resolved_at: new Date() })
    .where(
      and(
        eq(schema.needsReview.id, id),
        isNull(schema.needsReview.resolved_at),
      ),
    )
    .returning({
      id: schema.needsReview.id,
      slug: schema.needsReview.business_slug,
      reason: schema.needsReview.reason,
    });
  if (result.length === 0) {
    console.log(
      `No unresolved row with id=${id}. It may already be resolved, or the id may not exist.`,
    );
    return;
  }
  const row = result[0];
  console.log(`Resolved #${row.id}: ${row.slug}, ${row.reason}`);
}

async function resolveAllBannedWords(): Promise<void> {
  const { db, schema } = await getDb();
  const rows = await db
    .select({
      id: schema.needsReview.id,
      reason: schema.needsReview.reason,
      business_slug: schema.needsReview.business_slug,
    })
    .from(schema.needsReview)
    .where(isNull(schema.needsReview.resolved_at));
  const targets = rows.filter((r) => isBannedWordReason(r.reason));
  if (targets.length === 0) {
    console.log("No unresolved banned-phrase rows to resolve.");
    return;
  }
  for (const t of targets) {
    await db
      .update(schema.needsReview)
      .set({ resolved_at: new Date() })
      .where(eq(schema.needsReview.id, t.id));
    console.log(`Resolved #${t.id}: ${t.business_slug}, ${t.reason}`);
  }
  console.log(`\nResolved ${targets.length} banned-phrase row(s).`);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.resolveId !== null) {
    await resolveOne(flags.resolveId);
    return;
  }
  if (flags.resolveAllBannedWords) {
    await resolveAllBannedWords();
    return;
  }
  await listUnresolved(flags);
}

main().catch((err) => {
  console.error("review-queue failed:", (err as Error).message);
  process.exit(1);
});
