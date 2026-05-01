import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  AnalysisPlaybookItem,
  DiagnosisPullquote,
  ReviewTheme,
} from "@/lib/data/load-review-analysis";
import type {
  FeatureCredits,
  FeatureMovement,
  IssueStats,
  ScoreBreakdown,
  ScoreMovement,
  UnderratedEntry,
  UnfairAdvantage,
} from "@/lib/data/schemas";

/**
 * Drizzle schema for Burgh Quarterly. Phase 1 of the scale plan.
 *
 * Field names mirror `lib/data/schemas.ts` exactly so the JSON-to-DB
 * migration script can do a 1:1 map. JSONB columns are typed with $type
 * pulling from the existing Zod inferred types; if the Zod shapes change,
 * TypeScript catches the drift here.
 *
 * Conventions:
 *  - All timestamps are timestamptz.
 *  - Slugs are primary keys; no separate unique constraint.
 *  - Foreign keys on dependent tables cascade on delete.
 *  - Enums for tier, season, category, source, and ingest state.
 */

/* ------------------------------ Enums ----------------------------------- */

export const tierEnum = pgEnum("tier", [
  "icons",
  "ones_to_watch",
  "neighborhood_staples",
]);

export const seasonEnum = pgEnum("season", [
  "spring",
  "summer",
  "fall",
  "winter",
]);

export const categoryEnum = pgEnum("category", [
  "restaurant",
  "cafe",
  "salon",
  "boutique",
  "fitness",
  "bakery",
  "experience",
  "grocery",
  "bar",
  "brewery",
  "distillery",
  "tattoo",
  "ice_cream",
  "juice",
]);

export const businessSourceEnum = pgEnum("business_source", [
  "curated",
  "apify",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "subscribe",
  "claim",
  "alerts",
]);

export const leadClaimStatusEnum = pgEnum("lead_claim_status", [
  "pending",
  "verified",
  "rejected",
]);

export const ingestStepEnum = pgEnum("ingest_step", [
  "scraped",
  "photos_uploaded",
  "scored",
  "analyzed",
]);

export const ingestStatusEnum = pgEnum("ingest_status", [
  "pending",
  "success",
  "failed",
]);

/* ---------------------------- businesses -------------------------------- */

export const businesses = pgTable("businesses", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  category: categoryEnum("category").notNull(),
  neighborhood: text("neighborhood").notNull(),
  address: text("address").notNull(),
  website: text("website"),
  instagram: text("instagram"),
  tiktok: text("tiktok"),
  lat: real("lat"),
  lng: real("lng"),
  place_id: text("place_id"),
  hero_photo: text("hero_photo"),
  claimed: boolean("claimed").notNull().default(false),
  owner_email: text("owner_email"),
  source: businessSourceEnum("source").notNull().default("curated"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ------------------------- business_signals ----------------------------- */

export const businessSignals = pgTable(
  "business_signals",
  {
    business_slug: text("business_slug")
      .notNull()
      .references(() => businesses.slug, { onDelete: "cascade" }),
    issue_slug: text("issue_slug").notNull(),
    google_rating: real("google_rating"),
    google_review_count: integer("google_review_count"),
    review_freshness_days: integer("review_freshness_days"),
    posts_last_30: integer("posts_last_30"),
    reels_last_30: integer("reels_last_30"),
    has_booking_link: boolean("has_booking_link"),
    has_ugc_visible: boolean("has_ugc_visible"),
    scraped_at: timestamp("scraped_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.business_slug, table.issue_slug] }),
  }),
);

/* ------------------------- business_photos ------------------------------ */

export const businessPhotos = pgTable("business_photos", {
  id: serial("id").primaryKey(),
  business_slug: text("business_slug")
    .notNull()
    .references(() => businesses.slug, { onDelete: "cascade" }),
  url: text("url").notNull(),
  blob_key: text("blob_key"),
  source: text("source").notNull(),
  sort_order: integer("sort_order").notNull().default(0),
});

/* ------------------------- business_reviews ----------------------------- */

export const businessReviews = pgTable("business_reviews", {
  id: serial("id").primaryKey(),
  business_slug: text("business_slug")
    .notNull()
    .references(() => businesses.slug, { onDelete: "cascade" }),
  text: text("text").notNull(),
  rating: real("rating"),
  language: text("language"),
  posted_at: timestamp("posted_at", { withTimezone: true }),
  scraped_at: timestamp("scraped_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* --------------------- business_review_keywords ------------------------- */

export const businessReviewKeywords = pgTable(
  "business_review_keywords",
  {
    business_slug: text("business_slug")
      .notNull()
      .references(() => businesses.slug, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    frequency: integer("frequency").notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.business_slug, table.keyword] }),
  }),
);

/* -------------------------------- scores -------------------------------- */

export const scores = pgTable(
  "scores",
  {
    business_slug: text("business_slug")
      .notNull()
      .references(() => businesses.slug, { onDelete: "cascade" }),
    issue_slug: text("issue_slug").notNull(),
    subscores: jsonb("subscores").$type<ScoreBreakdown>().notNull(),
    composite: integer("composite").notNull(),
    tier: tierEnum("tier").notNull(),
    ranks: jsonb("ranks")
      .$type<{
        category: number;
        neighborhood: number;
        overall: number;
      }>()
      .notNull(),
    movement: jsonb("movement").$type<ScoreMovement>().notNull(),
    unfair_advantage: jsonb("unfair_advantage")
      .$type<UnfairAdvantage>()
      .notNull(),
    scored_at: timestamp("scored_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.business_slug, table.issue_slug] }),
  }),
);

/* ------------------------------ analyses -------------------------------- */

export const analyses = pgTable(
  "analyses",
  {
    business_slug: text("business_slug")
      .notNull()
      .references(() => businesses.slug, { onDelete: "cascade" }),
    issue_slug: text("issue_slug").notNull(),
    themes: jsonb("themes").$type<ReviewTheme[]>().notNull(),
    notable_quote: text("notable_quote").notNull(),
    sentiment_summary: text("sentiment_summary").notNull(),
    quarter_narrative: text("quarter_narrative"),
    tldr_read: text("tldr_read"),
    tldr_meaning: text("tldr_meaning"),
    diagnosis_pullquote: jsonb("diagnosis_pullquote").$type<DiagnosisPullquote>(),
    playbook: jsonb("playbook").$type<AnalysisPlaybookItem[]>(),
    review_count: integer("review_count").notNull().default(0),
    model: text("model").notNull(),
    prompt_version: text("prompt_version"),
    generated_at: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.business_slug, table.issue_slug] }),
  }),
);

/* ------------------------------- issues --------------------------------- */

export const issues = pgTable("issues", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  season: seasonEnum("season").notNull(),
  year: integer("year").notNull(),
  published_at: timestamp("published_at", { withTimezone: true }).notNull(),
  cover_blurb: text("cover_blurb").notNull(),
  stats: jsonb("stats").$type<IssueStats>().notNull(),
});

/* -------------------------- underrated_lists ---------------------------- */

export const underratedLists = pgTable("underrated_lists", {
  id: serial("id").primaryKey(),
  issue_slug: text("issue_slug")
    .notNull()
    .references(() => issues.slug, { onDelete: "cascade" }),
  category: categoryEnum("category").notNull(),
  title: text("title").notNull(),
  intro: text("intro").notNull(),
  entries: jsonb("entries").$type<UnderratedEntry[]>().notNull(),
});

/* ------------------------------ features -------------------------------- */

export const features = pgTable("features", {
  id: serial("id").primaryKey(),
  issue_slug: text("issue_slug")
    .notNull()
    .references(() => issues.slug, { onDelete: "cascade" }),
  business_slug: text("business_slug")
    .notNull()
    .references(() => businesses.slug, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  dek: text("dek").notNull(),
  body_mdx: text("body_mdx").notNull(),
  credits: jsonb("credits").$type<FeatureCredits>().notNull(),
  movement: jsonb("movement").$type<FeatureMovement>().notNull(),
  published_at: timestamp("published_at", { withTimezone: true }).notNull(),
});

/* --------------------------- lead_captures ------------------------------ */

export const leadCaptures = pgTable("lead_captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  source: leadSourceEnum("source").notNull(),
  business_slug: text("business_slug").references(() => businesses.slug, {
    onDelete: "set null",
  }),
  owner_name: text("owner_name"),
  verification_answer: text("verification_answer"),
  claim_status: leadClaimStatusEnum("claim_status"),
  opted_in_alerts: boolean("opted_in_alerts").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  consent_ip: text("consent_ip"),
  consent_ua: text("consent_ua"),
});

/* ---------------------------- ingest_runs ------------------------------- */

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    business_slug: text("business_slug")
      .notNull()
      .references(() => businesses.slug, { onDelete: "cascade" }),
    step: ingestStepEnum("step").notNull(),
    status: ingestStatusEnum("status").notNull().default("pending"),
    error: text("error"),
    started_at: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.business_slug, table.step] }),
  }),
);

/* -------------------------- ingest_cost_log ----------------------------- */

export const ingestCostLog = pgTable("ingest_cost_log", {
  id: serial("id").primaryKey(),
  business_slug: text("business_slug")
    .notNull()
    .references(() => businesses.slug, { onDelete: "cascade" }),
  step: ingestStepEnum("step").notNull(),
  model: text("model").notNull(),
  input_tokens: integer("input_tokens").notNull().default(0),
  cache_read_tokens: integer("cache_read_tokens").notNull().default(0),
  cache_write_tokens: integer("cache_write_tokens").notNull().default(0),
  output_tokens: integer("output_tokens").notNull().default(0),
  usd_cost: real("usd_cost").notNull().default(0),
  occurred_at: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ---------------------------- needs_review ------------------------------ */

export const needsReview = pgTable("needs_review", {
  id: serial("id").primaryKey(),
  business_slug: text("business_slug")
    .notNull()
    .references(() => businesses.slug, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolved_at: timestamp("resolved_at", { withTimezone: true }),
});

/* ------------------------------ types ----------------------------------- */

export type BusinessRow = typeof businesses.$inferSelect;
export type NewBusinessRow = typeof businesses.$inferInsert;
export type ScoreRow = typeof scores.$inferSelect;
export type AnalysisRow = typeof analyses.$inferSelect;
export type IssueRow = typeof issues.$inferSelect;
export type FeatureRow = typeof features.$inferSelect;
export type UnderratedListRow = typeof underratedLists.$inferSelect;
export type LeadCaptureRow = typeof leadCaptures.$inferSelect;
export type BusinessSignalsRow = typeof businessSignals.$inferSelect;
export type BusinessPhotoRow = typeof businessPhotos.$inferSelect;
export type BusinessReviewRow = typeof businessReviews.$inferSelect;
export type IngestRunRow = typeof ingestRuns.$inferSelect;
export type IngestCostLogRow = typeof ingestCostLog.$inferSelect;
export type NeedsReviewRow = typeof needsReview.$inferSelect;
