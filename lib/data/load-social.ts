import fs from "node:fs";
import path from "node:path";

/**
 * Social snapshot for a business — IG profile stats + Google Maps
 * growth deltas (Dec 2025 → Apr 2026). Written by:
 *   - scripts/scrape-ig-profiles.ts  (IG block)
 *   - scripts/compute-growth.ts       (growth block)
 *
 * Both fields are optional — a file may have IG only, growth only, or both.
 * UI components degrade gracefully when a field is null.
 */

export interface SocialIg {
  handle: string;
  followers: number;
  follows?: number;
  posts_total: number;
  posts_30d: number;
  reels_30d: number;
  avg_engagement_rate: number;
  verified: boolean;
  private: boolean;
  is_business_account?: boolean;
  biography?: string;
  full_name?: string;
  last_post_at: string | null;
  scraped_at: string;
  error?: string;
  errorDescription?: string;
}

export interface SocialGrowth {
  period_start: string;
  period_end: string;
  days: number;
  review_count: { start: number; end: number; delta: number; per_month: number };
  rating: { start: number; end: number; delta: number };
  photo_count: { start: number; end: number; delta: number };
}

export interface SocialRecord {
  slug: string;
  ig: SocialIg | null;
  growth: SocialGrowth | null;
}

const SOCIAL_DIR = path.join(process.cwd(), "content", "social");

export function loadSocialBySlug(slug: string): SocialRecord {
  const file = path.join(SOCIAL_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return { slug, ig: null, growth: null };

  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;

  const growth = (raw.growth ?? null) as SocialGrowth | null;

  // An IG record is considered present only if it contains a handle AND no
  // disabling error. Errors (e.g. "not_found") surface as ig=null so the UI
  // renders the empty state rather than pretending there's data.
  if (!raw.handle || raw.error) {
    return { slug, ig: null, growth };
  }

  const ig: SocialIg = {
    handle: raw.handle as string,
    followers: (raw.followers as number) ?? 0,
    follows: raw.follows as number | undefined,
    posts_total: (raw.posts_total as number) ?? 0,
    posts_30d: (raw.posts_30d as number) ?? 0,
    reels_30d: (raw.reels_30d as number) ?? 0,
    avg_engagement_rate: (raw.avg_engagement_rate as number) ?? 0,
    verified: Boolean(raw.verified),
    private: Boolean(raw.private),
    is_business_account: raw.is_business_account as boolean | undefined,
    biography: raw.biography as string | undefined,
    full_name: raw.full_name as string | undefined,
    last_post_at: (raw.last_post_at as string | null) ?? null,
    scraped_at: (raw.scraped_at as string) ?? "",
  };

  return { slug, ig, growth };
}
