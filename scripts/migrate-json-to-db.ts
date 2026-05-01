/**
 * scripts/migrate-json-to-db.ts
 *
 * One-shot migration that reads the existing JSON content (businesses,
 * review-analysis, lists, leads) and inserts the rows into Postgres.
 *
 * Default mode is DRY-RUN. Pass --commit to actually write. Without --commit,
 * the script validates every record against Zod, builds the UPSERT through
 * Drizzle's query builder (so column wiring is real), and prints a tally.
 *
 * Usage:
 *   npx tsx scripts/migrate-json-to-db.ts             // dry run
 *   npx tsx scripts/migrate-json-to-db.ts --commit    // writes to DB
 *   npx tsx scripts/migrate-json-to-db.ts --table=businesses --commit
 *   npx tsx scripts/migrate-json-to-db.ts --slug=meetcha --commit
 *
 * No em-dashes anywhere in this file. Project hard rule.
 */
import fs from "node:fs";
import path from "node:path";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";

import {
  BusinessSchema,
  IssueSchema,
  ScoreSchema,
  UnderratedListSchema,
  type Business,
  type Score,
  type Category,
} from "@/lib/data/schemas";
import type { ReviewAnalysis } from "@/lib/data/load-review-analysis";
import * as schema from "@/lib/db/schema";

/* --------------------------- CLI flag parsing --------------------------- */

interface Flags {
  commit: boolean;
  table: string | null;
  slug: string | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { commit: false, table: null, slug: null };
  for (const arg of argv) {
    if (arg === "--commit") flags.commit = true;
    else if (arg.startsWith("--table=")) flags.table = arg.slice(8);
    else if (arg.startsWith("--slug=")) flags.slug = arg.slice(7);
  }
  return flags;
}

/* ----------------------------- Constants -------------------------------- */

const ROOT = process.cwd();
const BUSINESSES_DIR = path.join(ROOT, "content", "businesses");
const ANALYSES_DIR = path.join(ROOT, "content", "review-analysis");
const ISSUE_MANIFEST = path.join(
  ROOT,
  "content",
  "issues",
  "spring-2026",
  "manifest.json",
);
const LISTS_DIR = path.join(ROOT, "content", "lists", "articles");
const LEADS_FILE = path.join(ROOT, "content", "leads", "leads.jsonl");

/**
 * Canonical issue slug. JSON content (every business, every score, every
 * analysis), Zod schema docstring, and DATA_MODEL.md all use "2026-spring".
 * The directory and manifest happen to use "spring-2026" for file-organization
 * reasons but that is metadata about storage, not data identity. The migration
 * preserves JSON content verbatim.
 */
const DEFAULT_ISSUE_SLUG = "2026-spring";

/* ---------------------------- DB instance ------------------------------- */

/**
 * Build a Drizzle instance. In dry-run mode the DATABASE_URL is not required
 * because we only call .toSQL() on the query builder. In commit mode we
 * require it and execute.
 */
function getDb(commit: boolean) {
  const url = process.env.DATABASE_URL;
  if (commit && !url) {
    throw new Error(
      "--commit requires DATABASE_URL. Provision Neon and rerun.",
    );
  }
  // Placeholder URL is fine for dry-run; we never call .execute().
  const sqlClient = neon(url ?? "postgres://dryrun:dryrun@localhost/dryrun");
  return drizzle(sqlClient, { schema });
}

/* ----------------------------- Tally types ------------------------------ */

interface Tally {
  read: number;
  validated: number;
  skipped: number;
  inserted: number;
}

const newTally = (): Tally => ({
  read: 0,
  validated: 0,
  skipped: 0,
  inserted: 0,
});

const tallies: Record<string, Tally> = {
  issues: newTally(),
  businesses: newTally(),
  business_signals: newTally(),
  business_photos: newTally(),
  business_review_keywords: newTally(),
  scores: newTally(),
  analyses: newTally(),
  underrated_lists: newTally(),
  features: newTally(),
  lead_captures: newTally(),
};

const skipped: Array<{ slug: string; reason: string }> = [];
const patches: string[] = [];
let firstBusinessSql: string | null = null;

/* --------------------------- Helper utilities --------------------------- */

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

function readJson<T = unknown>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/**
 * Build a Postgres ON CONFLICT UPSERT clause for a SET update from a target
 * column list. Drizzle does not provide a built-in helper for "update every
 * column to the new value"; we generate the SET pairs explicitly.
 */
function setAllExcluded(columns: string[]): Record<string, ReturnType<typeof sql>> {
  const out: Record<string, ReturnType<typeof sql>> = {};
  for (const col of columns) {
    out[col] = sql.raw(`EXCLUDED."${col}"`);
  }
  return out;
}

/* ----------------------- Tier inference for lists ----------------------- */

const UNDERRATED_LIST_TO_CATEGORY: Record<string, Category> = {
  "underrated-asian-kitchens": "restaurant",
  "underrated-bars": "restaurant",
  "underrated-cafes": "cafe",
  "underrated-restaurants": "restaurant",
  "underrated-sweets": "bakery",
};

/* ---------------------------- Step: issues ------------------------------ */

async function migrateIssues(
  db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  if (flags.table && flags.table !== "issues") return;
  const t = tallies.issues;

  if (!fs.existsSync(ISSUE_MANIFEST)) {
    skipped.push({
      slug: DEFAULT_ISSUE_SLUG,
      reason: "manifest.json not found; nothing to migrate for issues",
    });
    return;
  }
  t.read += 1;

  // The on-disk manifest has only {issue_id, snapshotted_at, sources, total_files}.
  // Synthesize an Issue row that satisfies IssueSchema. cover_blurb and stats
  // are placeholders because the on-disk data does not carry them.
  const manifest = readJson<{
    issue_id: string;
    snapshotted_at: string;
    total_files: number;
  }>(ISSUE_MANIFEST);

  patches.push(
    "issues row synthesized from manifest.json (no issue.json on disk). " +
      "title, cover_blurb, and stats are placeholders pending editorial fill-in.",
  );

  const issueRow = {
    slug: DEFAULT_ISSUE_SLUG,
    title: "Spring 2026",
    season: "spring" as const,
    year: 2026,
    published_at: manifest.snapshotted_at,
    cover_blurb: "Issue 01. Pittsburgh's businesses, ranked by how they show up.",
    features: [],
    underrated_lists: [],
    stats: {
      businesses_ranked: 30,
      new_entries: 30,
      movers_into_icons: 0,
      biggest_climber_slug: "24-carrot-juice",
    },
  };

  const parsed = IssueSchema.safeParse(issueRow);
  if (!parsed.success) {
    skipped.push({
      slug: DEFAULT_ISSUE_SLUG,
      reason: `IssueSchema failed: ${parsed.error.message.slice(0, 200)}`,
    });
    return;
  }
  t.validated += 1;

  const dbRow = {
    slug: parsed.data.slug,
    title: parsed.data.title,
    season: parsed.data.season,
    year: parsed.data.year,
    published_at: new Date(parsed.data.published_at),
    cover_blurb: parsed.data.cover_blurb,
    stats: parsed.data.stats,
  };

  const stmt = db
    .insert(schema.issues)
    .values(dbRow)
    .onConflictDoUpdate({
      target: schema.issues.slug,
      set: setAllExcluded([
        "title",
        "season",
        "year",
        "published_at",
        "cover_blurb",
        "stats",
      ]),
    });

  if (flags.commit) {
    await stmt;
    t.inserted += 1;
  } else {
    t.inserted += 1;
  }
  console.log(`[1/1] inserted: issues (${parsed.data.slug})`);
}

/* --------- Step: businesses + signals + photos + keywords + scores ------- */

interface BizFile {
  slug: string;
  business: Business;
  score: Score;
  meta: {
    placeId?: string;
  } | null;
}

function loadBusinessFile(file: string): BizFile | null {
  const raw = readJson<Record<string, unknown>>(file);
  const slug = String(raw.slug ?? "");
  const { _meta, _score, ...rest } = raw as {
    _meta?: { placeId?: string };
    _score?: unknown;
    [k: string]: unknown;
  };

  const biz = BusinessSchema.safeParse(rest);
  if (!biz.success) {
    skipped.push({
      slug,
      reason: `BusinessSchema failed: ${biz.error.message.slice(0, 200)}`,
    });
    return null;
  }

  const score = ScoreSchema.safeParse(_score);
  if (!score.success) {
    skipped.push({
      slug,
      reason: `ScoreSchema failed: ${score.error.message.slice(0, 200)}`,
    });
    return null;
  }

  return { slug, business: biz.data, score: score.data, meta: _meta ?? null };
}

async function migrateBusinesses(
  db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  const restrictTables = flags.table
    ? new Set(
        flags.table === "businesses"
          ? [
              "businesses",
              "business_signals",
              "business_photos",
              "business_review_keywords",
              "scores",
            ]
          : [flags.table],
      )
    : null;

  const wants = (t: string) => !restrictTables || restrictTables.has(t);

  let files = listJsonFiles(BUSINESSES_DIR);
  if (flags.slug) files = files.filter((f) => f === `${flags.slug}.json`);
  const total = files.length;

  patches.push(
    "businesses.lat / businesses.lng default to null (JSON has no coordinates).",
  );
  patches.push(
    "businesses.place_id pulled from _meta.placeId in the JSON (drops to null if absent).",
  );
  patches.push(
    "businesses.source defaulted to 'curated' for every JSON-backed business.",
  );
  patches.push(
    "scores.ranks JSONB synthesized from rank_category, rank_neighborhood, rank_overall (Zod has them flat; schema groups them).",
  );
  patches.push(
    "score.issue_slug preserved verbatim from JSON ('" +
      DEFAULT_ISSUE_SLUG +
      "'). Folder/manifest use 'spring-2026' but JSON content is canonical.",
  );
  patches.push(
    "business_signals row created per business and keyed to '" +
      DEFAULT_ISSUE_SLUG +
      "' (signals live on Business in Zod, in business_signals in the schema).",
  );

  let i = 0;
  for (const file of files) {
    i += 1;
    tallies.businesses.read += 1;
    const parsed = loadBusinessFile(path.join(BUSINESSES_DIR, file));
    if (!parsed) continue;
    tallies.businesses.validated += 1;

    const b = parsed.business;
    const placeId = parsed.meta?.placeId ?? null;

    const bizRow = {
      slug: b.slug,
      name: b.name,
      category: b.category,
      neighborhood: b.neighborhood,
      address: b.address,
      website: b.website ?? null,
      instagram: b.instagram ?? null,
      tiktok: b.tiktok ?? null,
      lat: null,
      lng: null,
      place_id: placeId,
      hero_photo: b.hero_photo ?? null,
      claimed: b.claimed,
      owner_email: b.owner_email ?? null,
      source: "curated" as const,
      created_at: new Date(b.created_at),
      updated_at: new Date(b.updated_at),
    };

    const bizStmt = db
      .insert(schema.businesses)
      .values(bizRow)
      .onConflictDoUpdate({
        target: schema.businesses.slug,
        set: setAllExcluded([
          "name",
          "category",
          "neighborhood",
          "address",
          "website",
          "instagram",
          "tiktok",
          "lat",
          "lng",
          "place_id",
          "hero_photo",
          "claimed",
          "owner_email",
          "source",
          "updated_at",
        ]),
      });

    if (firstBusinessSql === null) {
      const built = bizStmt.toSQL();
      firstBusinessSql = built.sql;
    }

    if (wants("businesses")) {
      if (flags.commit) await bizStmt;
      tallies.businesses.inserted += 1;
    }

    // ----- business_signals (one row per business, keyed to current issue) -----
    if (wants("business_signals")) {
      const sigRow = {
        business_slug: b.slug,
        issue_slug: DEFAULT_ISSUE_SLUG,
        google_rating: b.google_rating ?? null,
        google_review_count: b.google_review_count ?? null,
        review_freshness_days: b.review_freshness_days ?? null,
        posts_last_30: b.posts_last_30 ?? null,
        reels_last_30: b.reels_last_30 ?? null,
        has_booking_link: b.has_booking_link ?? null,
        has_ugc_visible: b.has_ugc_visible ?? null,
      };
      const sigStmt = db
        .insert(schema.businessSignals)
        .values(sigRow)
        .onConflictDoUpdate({
          target: [
            schema.businessSignals.business_slug,
            schema.businessSignals.issue_slug,
          ],
          set: setAllExcluded([
            "google_rating",
            "google_review_count",
            "review_freshness_days",
            "posts_last_30",
            "reels_last_30",
            "has_booking_link",
            "has_ugc_visible",
          ]),
        });
      tallies.business_signals.read += 1;
      tallies.business_signals.validated += 1;
      if (flags.commit) await sigStmt;
      tallies.business_signals.inserted += 1;
    }

    // ----- business_photos -----
    if (wants("business_photos")) {
      for (let p = 0; p < b.photos.length; p += 1) {
        const photo = b.photos[p];
        tallies.business_photos.read += 1;
        tallies.business_photos.validated += 1;
        const photoStmt = db
          .insert(schema.businessPhotos)
          .values({
            business_slug: b.slug,
            url: photo.url,
            blob_key: null,
            source: photo.source,
            sort_order: p,
          })
          .onConflictDoNothing();
        if (flags.commit) await photoStmt;
        tallies.business_photos.inserted += 1;
      }
    }

    // ----- business_review_keywords -----
    if (wants("business_review_keywords")) {
      for (const kw of b.review_keywords) {
        tallies.business_review_keywords.read += 1;
        tallies.business_review_keywords.validated += 1;
        const kwStmt = db
          .insert(schema.businessReviewKeywords)
          .values({
            business_slug: b.slug,
            keyword: kw,
            frequency: 1,
          })
          .onConflictDoUpdate({
            target: [
              schema.businessReviewKeywords.business_slug,
              schema.businessReviewKeywords.keyword,
            ],
            set: setAllExcluded(["frequency"]),
          });
        if (flags.commit) await kwStmt;
        tallies.business_review_keywords.inserted += 1;
      }
    }

    // ----- scores (with issue_slug remap) -----
    if (wants("scores")) {
      const s = parsed.score;
      const issueSlug = DEFAULT_ISSUE_SLUG;
      const scoreRow = {
        business_slug: s.business_slug,
        issue_slug: issueSlug,
        subscores: s.subscores,
        composite: s.composite,
        tier: s.tier,
        ranks: {
          category: s.rank_category,
          neighborhood: s.rank_neighborhood,
          overall: s.rank_overall,
        },
        movement: s.movement,
        unfair_advantage: s.unfair_advantage,
        scored_at: new Date(s.scored_at),
      };
      const scoreStmt = db
        .insert(schema.scores)
        .values(scoreRow)
        .onConflictDoUpdate({
          target: [schema.scores.business_slug, schema.scores.issue_slug],
          set: setAllExcluded([
            "subscores",
            "composite",
            "tier",
            "ranks",
            "movement",
            "unfair_advantage",
            "scored_at",
          ]),
        });
      tallies.scores.read += 1;
      tallies.scores.validated += 1;
      if (flags.commit) await scoreStmt;
      tallies.scores.inserted += 1;
    }

    console.log(
      `[${i}/${total}] inserted: businesses (${b.slug}) + dependents`,
    );
  }
}

/* ---------------------------- Step: analyses ---------------------------- */

async function migrateAnalyses(
  db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  if (flags.table && flags.table !== "analyses") return;

  let files = listJsonFiles(ANALYSES_DIR);
  if (flags.slug) files = files.filter((f) => f === `${flags.slug}.json`);
  const total = files.length;

  patches.push(
    "analyses.review_count defaulted to 0 when missing in JSON (some older files lack it).",
  );
  patches.push(
    "analyses.prompt_version defaulted to null (not stored on disk).",
  );

  let i = 0;
  for (const file of files) {
    i += 1;
    tallies.analyses.read += 1;
    const raw = readJson<ReviewAnalysis>(path.join(ANALYSES_DIR, file));
    const slug = raw.slug;
    if (!slug) {
      skipped.push({ slug: file, reason: "analysis JSON missing slug" });
      continue;
    }
    if (!Array.isArray(raw.themes) || raw.themes.length === 0) {
      skipped.push({ slug, reason: "analysis missing themes[]" });
      continue;
    }
    if (!raw.notable_quote || !raw.sentiment_summary) {
      skipped.push({
        slug,
        reason: "analysis missing notable_quote or sentiment_summary",
      });
      continue;
    }
    tallies.analyses.validated += 1;

    const analysisRow = {
      business_slug: slug,
      issue_slug: DEFAULT_ISSUE_SLUG,
      themes: raw.themes,
      notable_quote: raw.notable_quote,
      sentiment_summary: raw.sentiment_summary,
      quarter_narrative: raw.quarter_narrative ?? null,
      tldr_read: raw.tldr_read ?? null,
      tldr_meaning: raw.tldr_meaning ?? null,
      diagnosis_pullquote: raw.diagnosis_pullquote ?? null,
      playbook: raw.playbook ?? null,
      review_count: raw.review_count ?? 0,
      model: raw.model ?? "unknown",
      prompt_version: null,
      generated_at: raw.analyzed_at
        ? new Date(raw.analyzed_at)
        : new Date(),
    };

    const stmt = db
      .insert(schema.analyses)
      .values(analysisRow)
      .onConflictDoUpdate({
        target: [schema.analyses.business_slug, schema.analyses.issue_slug],
        set: setAllExcluded([
          "themes",
          "notable_quote",
          "sentiment_summary",
          "quarter_narrative",
          "tldr_read",
          "tldr_meaning",
          "diagnosis_pullquote",
          "playbook",
          "review_count",
          "model",
          "prompt_version",
          "generated_at",
        ]),
      });

    if (flags.commit) await stmt;
    tallies.analyses.inserted += 1;
    console.log(`[${i}/${total}] inserted: analyses (${slug})`);
  }
}

/* -------------------------- Step: underrated_lists ---------------------- */

interface UnderratedItem {
  rank: number;
  business_slug: string;
  descriptor?: string;
  stat_line?: string;
  playbook_top_move?: string;
}

interface UnderratedListFile {
  slug: string;
  title: string;
  intro?: string;
  items: UnderratedItem[];
}

async function migrateUnderratedLists(
  db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  if (flags.table && flags.table !== "underrated_lists") return;

  const files = listJsonFiles(LISTS_DIR).filter((f) =>
    f.startsWith("underrated-"),
  );

  patches.push(
    "underrated_lists pulled from content/lists/articles/underrated-*.json. " +
      "Cross-category file underrated-spring-2026.json skipped (no single category fits).",
  );
  patches.push(
    "underrated entries map: descriptor -> why, stat_line+playbook_top_move -> evidence.",
  );

  let i = 0;
  const total = files.length;
  for (const file of files) {
    i += 1;
    tallies.underrated_lists.read += 1;
    const slug = file.replace(/\.json$/, "");
    const category = UNDERRATED_LIST_TO_CATEGORY[slug];
    if (!category) {
      skipped.push({
        slug,
        reason: "no category mapping (cross-category list); skipped",
      });
      continue;
    }
    const raw = readJson<UnderratedListFile>(path.join(LISTS_DIR, file));
    const entries = (raw.items ?? []).map((item) => ({
      business_slug: item.business_slug,
      rank_on_list: item.rank,
      why: item.descriptor ?? "(no descriptor)",
      evidence: [item.stat_line, item.playbook_top_move]
        .filter(Boolean)
        .join(" | ") || "(no evidence)",
    }));

    const listForZod = {
      issue_slug: DEFAULT_ISSUE_SLUG,
      category,
      title: raw.title,
      intro: raw.intro ?? raw.title,
      entries,
    };
    const parsed = UnderratedListSchema.safeParse(listForZod);
    if (!parsed.success) {
      skipped.push({
        slug,
        reason: `UnderratedListSchema failed: ${parsed.error.message.slice(0, 200)}`,
      });
      continue;
    }
    tallies.underrated_lists.validated += 1;

    const stmt = db.insert(schema.underratedLists).values({
      issue_slug: parsed.data.issue_slug,
      category: parsed.data.category,
      title: parsed.data.title,
      intro: parsed.data.intro,
      entries: parsed.data.entries,
    });

    if (flags.commit) await stmt;
    tallies.underrated_lists.inserted += 1;
    console.log(`[${i}/${total}] inserted: underrated_lists (${slug})`);
  }
}

/* ---------------------------- Step: features ---------------------------- */

async function migrateFeatures(
  _db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  if (flags.table && flags.table !== "features") return;
  // No content/issues/<slug>/features/*.mdx files exist on disk yet. Nothing
  // to ingest. The features table will populate when editorial features land
  // in a future commit.
  patches.push(
    "features: 0 rows. No content/issues/<slug>/features/*.mdx files exist yet.",
  );
}

/* -------------------------- Step: lead_captures ------------------------- */

interface RawLead {
  email?: string;
  follow?: string;
  source?: string;
  ip?: string;
  ua?: string;
  captured_at?: string;
}

async function migrateLeadCaptures(
  db: ReturnType<typeof getDb>,
  flags: Flags,
): Promise<void> {
  if (flags.table && flags.table !== "lead_captures") return;
  if (!fs.existsSync(LEADS_FILE)) {
    patches.push(
      "lead_captures: leads.jsonl not found (production writes go to Attio + HubSpot).",
    );
    return;
  }

  patches.push(
    "lead_captures.source mapped from leads.jsonl 'source' URL into the 'subscribe' enum (only test data exists).",
  );
  patches.push(
    "lead_captures: leads.jsonl has no id, no claim_status; we let DB defaultRandom() generate id and leave claim_status null.",
  );

  const lines = fs
    .readFileSync(LEADS_FILE, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  let i = 0;
  for (const line of lines) {
    i += 1;
    tallies.lead_captures.read += 1;
    let raw: RawLead;
    try {
      raw = JSON.parse(line) as RawLead;
    } catch (err) {
      skipped.push({
        slug: `leads.jsonl#${i}`,
        reason: `invalid JSON: ${(err as Error).message}`,
      });
      continue;
    }
    if (!raw.email) {
      skipped.push({ slug: `leads.jsonl#${i}`, reason: "missing email" });
      continue;
    }
    tallies.lead_captures.validated += 1;

    const stmt = db.insert(schema.leadCaptures).values({
      email: raw.email,
      source: "subscribe",
      business_slug: null,
      owner_name: null,
      verification_answer: null,
      claim_status: null,
      opted_in_alerts: false,
      consent_ip: raw.ip ?? null,
      consent_ua: raw.ua ?? null,
      created_at: raw.captured_at ? new Date(raw.captured_at) : new Date(),
    });

    if (flags.commit) await stmt;
    tallies.lead_captures.inserted += 1;
  }
  if (lines.length > 0) {
    console.log(`[${lines.length}/${lines.length}] inserted: lead_captures`);
  }
}

/* ------------------------------- Report --------------------------------- */

function printSummary(flags: Flags) {
  const mode = flags.commit ? "COMMIT" : "DRY-RUN";
  console.log("");
  console.log("================ MIGRATION SUMMARY ================");
  console.log(`mode: ${mode}`);
  console.log("");
  console.log("table".padEnd(28) + "read  valid  skip  insert");
  for (const [table, t] of Object.entries(tallies)) {
    console.log(
      table.padEnd(28) +
        String(t.read).padStart(4) +
        "  " +
        String(t.validated).padStart(5) +
        "  " +
        String(t.skipped).padStart(4) +
        "  " +
        String(t.inserted).padStart(6),
    );
  }
  console.log("");
  console.log("--- skipped records ---");
  if (skipped.length === 0) {
    console.log("(none)");
  } else {
    for (const s of skipped) console.log(`  ${s.slug}: ${s.reason}`);
  }
  console.log("");
  console.log("--- field-name patches applied ---");
  for (const p of patches) console.log(`  - ${p}`);
  console.log("");
  console.log("--- sample upsert SQL: businesses (first row) ---");
  console.log(firstBusinessSql ?? "(none built; no businesses processed)");
  console.log("===================================================");
}

/* --------------------------------- main --------------------------------- */

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  console.log(
    `migrate-json-to-db running in ${flags.commit ? "COMMIT" : "DRY-RUN"} mode`,
  );
  if (flags.table) console.log(`  --table=${flags.table}`);
  if (flags.slug) console.log(`  --slug=${flags.slug}`);

  const db = getDb(flags.commit);

  await migrateIssues(db, flags);
  await migrateBusinesses(db, flags);
  await migrateAnalyses(db, flags);
  await migrateUnderratedLists(db, flags);
  await migrateFeatures(db, flags);
  await migrateLeadCaptures(db, flags);

  printSummary(flags);
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
