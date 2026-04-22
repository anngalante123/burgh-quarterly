import fs from "node:fs";
import path from "node:path";

import {
  BusinessSchema,
  ScoreSchema,
  type Business,
  type Score,
} from "./schemas";

/**
 * On-disk artifact produced by scripts/ingest-30.ts + compute-ranks.ts.
 *
 * The Business fields live at the root; `_meta` holds scoring inputs
 * (for the insight blocks) and `_score` holds the computed Score.
 */
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

const BUSINESSES_DIR = path.join(process.cwd(), "content", "businesses");

/**
 * Load a single business by slug. Returns null if the file doesn't exist
 * or fails Zod validation.
 */
export function loadBusinessBySlug(slug: string): BusinessArtifact | null {
  const file = path.join(BUSINESSES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;

  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const { _meta, _score, ...businessFields } = raw as {
    _meta: BusinessArtifact["meta"];
    _score: Score & { momentum_source?: string };
    [key: string]: unknown;
  };

  const biz = BusinessSchema.safeParse(businessFields);
  if (!biz.success) {
    console.error(
      `[load-business] ${slug}: Business schema failed: ${
        biz.error.message.slice(0, 240)
      }`,
    );
    return null;
  }

  const score = ScoreSchema.safeParse(_score);
  if (!score.success) {
    console.error(
      `[load-business] ${slug}: Score schema failed: ${
        score.error.message.slice(0, 240)
      }`,
    );
    return null;
  }

  return {
    business: biz.data,
    score: score.data,
    meta: _meta,
    momentum_source: _score.momentum_source ?? "stub_pending_instagram_data",
  };
}

/**
 * List all slugs present on disk. Used by generateStaticParams.
 */
export function listAllBusinessSlugs(): string[] {
  if (!fs.existsSync(BUSINESSES_DIR)) return [];
  return fs
    .readdirSync(BUSINESSES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/**
 * Load every business (for neighborhood peer lookups, etc.).
 */
export function loadAllBusinesses(): BusinessArtifact[] {
  return listAllBusinessSlugs()
    .map((slug) => loadBusinessBySlug(slug))
    .filter((x): x is BusinessArtifact => x !== null);
}
