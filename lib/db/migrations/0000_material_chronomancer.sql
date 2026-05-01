CREATE TYPE "public"."business_source" AS ENUM('curated', 'apify');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('restaurant', 'cafe', 'salon', 'boutique', 'fitness', 'bakery', 'experience');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ingest_step" AS ENUM('scraped', 'photos_uploaded', 'scored', 'analyzed');--> statement-breakpoint
CREATE TYPE "public"."lead_claim_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('subscribe', 'claim', 'alerts');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('spring', 'summer', 'fall', 'winter');--> statement-breakpoint
CREATE TYPE "public"."tier" AS ENUM('icons', 'ones_to_watch', 'neighborhood_staples');--> statement-breakpoint
CREATE TABLE "analyses" (
	"business_slug" text NOT NULL,
	"issue_slug" text NOT NULL,
	"themes" jsonb NOT NULL,
	"notable_quote" text NOT NULL,
	"sentiment_summary" text NOT NULL,
	"quarter_narrative" text,
	"tldr_read" text,
	"tldr_meaning" text,
	"diagnosis_pullquote" jsonb,
	"playbook" jsonb,
	"review_count" integer DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_business_slug_issue_slug_pk" PRIMARY KEY("business_slug","issue_slug")
);
--> statement-breakpoint
CREATE TABLE "business_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_slug" text NOT NULL,
	"url" text NOT NULL,
	"blob_key" text,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_review_keywords" (
	"business_slug" text NOT NULL,
	"keyword" text NOT NULL,
	"frequency" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "business_review_keywords_business_slug_keyword_pk" PRIMARY KEY("business_slug","keyword")
);
--> statement-breakpoint
CREATE TABLE "business_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_slug" text NOT NULL,
	"text" text NOT NULL,
	"rating" real,
	"language" text,
	"posted_at" timestamp with time zone,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_signals" (
	"business_slug" text NOT NULL,
	"issue_slug" text NOT NULL,
	"google_rating" real,
	"google_review_count" integer,
	"review_freshness_days" integer,
	"posts_last_30" integer,
	"reels_last_30" integer,
	"has_booking_link" boolean,
	"has_ugc_visible" boolean,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_signals_business_slug_issue_slug_pk" PRIMARY KEY("business_slug","issue_slug")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" "category" NOT NULL,
	"neighborhood" text NOT NULL,
	"address" text NOT NULL,
	"website" text,
	"instagram" text,
	"tiktok" text,
	"lat" real,
	"lng" real,
	"place_id" text,
	"hero_photo" text,
	"claimed" boolean DEFAULT false NOT NULL,
	"owner_email" text,
	"source" "business_source" DEFAULT 'curated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_slug" text NOT NULL,
	"business_slug" text NOT NULL,
	"headline" text NOT NULL,
	"dek" text NOT NULL,
	"body_mdx" text NOT NULL,
	"credits" jsonb NOT NULL,
	"movement" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_cost_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_slug" text NOT NULL,
	"step" "ingest_step" NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"usd_cost" real DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"business_slug" text NOT NULL,
	"step" "ingest_step" NOT NULL,
	"status" "ingest_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ingest_runs_business_slug_step_pk" PRIMARY KEY("business_slug","step")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"season" "season" NOT NULL,
	"year" integer NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"cover_blurb" text NOT NULL,
	"stats" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"source" "lead_source" NOT NULL,
	"business_slug" text,
	"owner_name" text,
	"verification_answer" text,
	"claim_status" "lead_claim_status",
	"opted_in_alerts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consent_ip" text,
	"consent_ua" text
);
--> statement-breakpoint
CREATE TABLE "needs_review" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_slug" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"business_slug" text NOT NULL,
	"issue_slug" text NOT NULL,
	"subscores" jsonb NOT NULL,
	"composite" integer NOT NULL,
	"tier" "tier" NOT NULL,
	"ranks" jsonb NOT NULL,
	"movement" jsonb NOT NULL,
	"unfair_advantage" jsonb NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_business_slug_issue_slug_pk" PRIMARY KEY("business_slug","issue_slug")
);
--> statement-breakpoint
CREATE TABLE "underrated_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_slug" text NOT NULL,
	"category" "category" NOT NULL,
	"title" text NOT NULL,
	"intro" text NOT NULL,
	"entries" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_photos" ADD CONSTRAINT "business_photos_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_review_keywords" ADD CONSTRAINT "business_review_keywords_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reviews" ADD CONSTRAINT "business_reviews_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_signals" ADD CONSTRAINT "business_signals_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_issue_slug_issues_slug_fk" FOREIGN KEY ("issue_slug") REFERENCES "public"."issues"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_cost_log" ADD CONSTRAINT "ingest_cost_log_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "needs_review" ADD CONSTRAINT "needs_review_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_business_slug_businesses_slug_fk" FOREIGN KEY ("business_slug") REFERENCES "public"."businesses"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "underrated_lists" ADD CONSTRAINT "underrated_lists_issue_slug_issues_slug_fk" FOREIGN KEY ("issue_slug") REFERENCES "public"."issues"("slug") ON DELETE cascade ON UPDATE no action;