import fs from "node:fs";
import path from "node:path";

/**
 * Loader for the list-article JSONs produced by scripts/generate-list.ts.
 * Used by app/best-on-social/[slug]/page.tsx to render each article.
 */

export type ListArticleItem = {
  rank: number;
  business_slug: string;
  name: string;
  family_label: string;
  neighborhood: string;
  descriptor: string;
  descriptor_highlight: string;
  stat_line: string;
  featured_tiktok?: {
    author: string;
    plays: number;
    url: string;
    caption: string;
  };
  playbook_top_move?: string;
};

/** Item shape for "creator post" list articles (kind: "posts").
 *  Used by the TikTok ABOUT list, the IG by-engagement list, and the
 *  IG most-creative list. Each list adds optional fields it cares about
 *  (`creativity_score` + `why` for the creative list, `engagement_rate`
 *  + `followers` for the engagement-rate list). */
export type PostArticleItem = {
  rank: number;
  kind: "post";
  /** "tiktok" for the ABOUT list, "instagram" for the BY list. Optional
   *  for back-compat with articles generated before this field existed. */
  platform?: "tiktok" | "instagram";
  video_url: string;
  video_id?: string | null;
  thumbnail_url?: string | null;
  plays: number;
  likes: number;
  /** Comments count, only set for IG posts in practice. */
  comments?: number;
  posted: string;
  caption: string;
  creator_handle: string;
  business_slug: string;
  business_name: string;
  family_label: string;
  neighborhood: string;
  /** "Image" | "Sidecar" | "Video" for IG posts, undefined for TikTok. */
  ig_type?: string;
  /** Most-creative list only: composite creativity score 1-10. */
  creativity_score?: number;
  /** Most-creative list only: per-dimension breakdown. */
  scores?: {
    visual_concept: number;
    caption_craft: number;
    format_fit: number;
    surprise: number;
    why: string;
  };
  /** Most-creative list only: editorial commentary on why this scored. */
  why?: string;
  /** Engagement-rate list only: total engagement / followers, 0.05 = 5%. */
  engagement_rate?: number;
  /** Engagement-rate list only: total engagement signal. */
  total_engagement?: number;
  /** Engagement-rate list only: follower count at scrape time. */
  followers?: number;
};

export type ListArticle = {
  slug: string;
  /** Defaults to "businesses" for legacy articles, "posts" for creator-post lists. */
  kind?: "businesses" | "posts";
  title: string;
  subtitle?: string;
  angle: string;
  intro: string;
  items: ListArticleItem[] | PostArticleItem[];
  /** Optional editorial ranking label for the list-header meta, e.g.
   *  "ranked by originality, not reach". Preferred over the query-derived
   *  label and the "ranked by plays" fallback when present. */
  rank_label?: string;
  /** Optional article-specific sentence appended in the "How we picked
   *  this" methodology box, e.g. defining what a ranking multiple is
   *  measured against. */
  method_note?: string;
  query?: {
    filter?: Record<string, unknown>;
    ranking: string;
    limit: number;
  };
  generated_at: string;
  model: string;
};

export function isPostArticle(
  a: ListArticle,
): a is ListArticle & { items: PostArticleItem[] } {
  return a.kind === "posts";
}

const ARTICLES_DIR = path.join(process.cwd(), "content", "lists", "articles");

export function loadListArticleBySlug(slug: string): ListArticle | null {
  const file = path.join(ARTICLES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as ListArticle;
}

export function listAllListSlugs(): string[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadAllListArticles(): ListArticle[] {
  return listAllListSlugs()
    .map((slug) => loadListArticleBySlug(slug))
    .filter((a): a is ListArticle => a !== null);
}
