/**
 * own-posts-pool.ts, the single source of truth for which scraped
 * own-posts files (content/raw/own-posts/*.json) feed the public
 * "...From Pittsburgh Small Businesses" lists.
 *
 * Two data-quality rules live here so every list generator shares them
 * instead of re-reading the directory and re-implementing the policy:
 *
 * 1. EXCLUSION. Some scraped accounts are not Pittsburgh small
 *    businesses (national or regional franchises and institutions).
 *    They must never appear on these lists. See EXCLUDED_HANDLES.
 *
 * 2. DEDUPE. Several brands run ONE Instagram account across multiple
 *    business rows (same brand, multiple locations), so the same handle
 *    appears in 2-4 raw files. Without collapsing, the same post enters
 *    the candidate pool multiple times and can appear twice in a
 *    published top 10. The loader returns exactly one record per unique
 *    handle.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Editorial rule: national or regional franchises and institutions are
 * not Pittsburgh small businesses, so their accounts are excluded from
 * the "...From Pittsburgh Small Businesses" lists entirely.
 * Lowercase IG handles.
 */
export const EXCLUDED_HANDLES: ReadonlySet<string> = new Set([
  "ufcgym", // franchise
  "lifeatcmu", // university
  "ppgpaintsarena", // arena
  "novacarerehabilitation", // chain
  "sofresh", // franchise
  "eatwingsover", // franchise
  "aladdinseatery", // chain
  "anthonyscoalfiredpizza", // chain
  "condadotacos", // chain
  "noodlescompany", // chain
  "benihana", // chain
  "7brewcoffee", // franchise
  "gongchatea", // franchise
  "jenisicecreams", // chain
  "bowlamf", // chain
  "officialvocelli", // franchise
  "foxspizzabethelpark", // franchise
  "stretchlabstripdistrict", // franchise
  "d1trainingpghwest", // franchise
  "rompnroll_pittsburgh_east", // franchise
  "primantibros", // chain
  "kaminsciencecenter", // institution
  "slyfoxbeer", // regional brand account, content not Pittsburgh-specific
]);

/** One scraped IG post, exactly as the Apify own-posts scraper wrote it.
 *  Superset of the fields the list generators read. */
export type RawOwnPost = {
  shortCode?: string;
  url?: string;
  caption?: string;
  hashtags?: string[];
  type?: string;
  productType?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  displayUrl?: string;
  ownerUsername?: string;
};

export type OwnPostsRecord = {
  /** Canonical business slug for this handle. When several business rows
   *  share one handle, this is the lexicographically smallest slug
   *  (deterministic; same brand behind every slug, so the editorial
   *  result is identical whichever location carries the byline). */
  slug: string;
  /** The IG handle, lowercased. */
  handle: string;
  /** Post items from the canonical slug's raw file, unchanged. */
  items: RawOwnPost[];
};

const DEFAULT_RAW_DIR = join(process.cwd(), "content/raw/own-posts");

type RawFile = {
  handle?: string;
  items?: RawOwnPost[];
};

/**
 * Read every content/raw/own-posts/*.json file and return one record per
 * UNIQUE handle:
 *   - handles in EXCLUDED_HANDLES are dropped (and logged),
 *   - duplicate-handle slugs are collapsed to the lexicographically
 *     smallest slug (and logged),
 *   - the kept record's items array is the canonical file's, unchanged.
 *
 * Records are returned sorted by slug for deterministic downstream order.
 */
export async function loadOwnPostsPool(
  rawDir: string = DEFAULT_RAW_DIR,
): Promise<OwnPostsRecord[]> {
  const files = (await readdir(rawDir))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const byHandle = new Map<
    string,
    { slug: string; items: RawOwnPost[]; allSlugs: string[] }
  >();
  const excluded: string[] = [];

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const raw = JSON.parse(await readFile(join(rawDir, f), "utf-8")) as RawFile;
    const handle = (raw.handle ?? "").toLowerCase();
    if (!handle) {
      console.warn(`[own-posts-pool] ${slug}: missing handle, skipped`);
      continue;
    }
    if (EXCLUDED_HANDLES.has(handle)) {
      excluded.push(`@${handle} (${slug})`);
      continue;
    }
    const existing = byHandle.get(handle);
    if (!existing) {
      byHandle.set(handle, { slug, items: raw.items ?? [], allSlugs: [slug] });
      continue;
    }
    existing.allSlugs.push(slug);
    // Compare slugs, not filenames: "foo.json" sorts after "foo-bar.json"
    // ("." > "-") even though "foo" < "foo-bar" as slugs.
    if (slug < existing.slug) {
      existing.slug = slug;
      existing.items = raw.items ?? [];
    }
  }

  if (excluded.length > 0) {
    console.log(
      `[own-posts-pool] excluded ${excluded.length} files (franchises and institutions are not small businesses): ${excluded.join(", ")}`,
    );
  }
  for (const [handle, rec] of byHandle) {
    if (rec.allSlugs.length > 1) {
      console.log(
        `[own-posts-pool] @${handle} shared by ${rec.allSlugs.length} slugs [${rec.allSlugs.join(", ")}], kept ${rec.slug}`,
      );
    }
  }

  return [...byHandle.entries()]
    .map(([handle, rec]) => ({ slug: rec.slug, handle, items: rec.items }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
