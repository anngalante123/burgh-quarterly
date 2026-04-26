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

export type ListArticle = {
  slug: string;
  title: string;
  subtitle?: string;
  angle: string;
  intro: string;
  items: ListArticleItem[];
  query: {
    filter?: Record<string, unknown>;
    ranking: string;
    limit: number;
  };
  generated_at: string;
  model: string;
};

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
