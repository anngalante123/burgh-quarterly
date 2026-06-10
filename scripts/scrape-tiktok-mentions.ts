#!/usr/bin/env tsx
/**
 * scrape-tiktok-mentions, query Apify's TikTok scraper for "[business] pittsburgh"
 * (and a few smarter variants), aggregate the result set, and merge into
 * content/social/{slug}.json under the `tiktok_mentions` field.
 *
 * The point: for most small businesses the OWN TikTok account is missing,
 * but creators in Pittsburgh ARE filming them. That's the signal we want
 * to surface, total plays, unique creators, top video, top creator,
 * recency. Relay's product literally matches this gap.
 *
 * Candidates come from the full DB business catalog (lib/query/business-query,
 * ~2,580 businesses), not the 30 legacy content/businesses/*.json artifacts.
 *
 * Cost: about $0.005 per query x ~2,580 businesses = ~$13 for a full pass.
 * Runtime: 6 actor runs in flight at once (worker pool), each run capped
 * at a 6 minute poll so one hung run can't stall the batch.
 *
 * Run:
 *   npx tsx scripts/scrape-tiktok-mentions.ts                  # all
 *   npx tsx scripts/scrape-tiktok-mentions.ts <slug>           # one business
 *   npx tsx scripts/scrape-tiktok-mentions.ts --force          # overwrite cache
 *   npx tsx scripts/scrape-tiktok-mentions.ts --limit 50       # pilot: first 50 candidates
 *   npx tsx scripts/scrape-tiktok-mentions.ts --dry-run        # plan + cost, no Apify calls
 *
 * NOTE on new social files: businesses with no content/social/<slug>.json
 * yet get a minimal { slug, tiktok_mentions } file. Deliberately NO
 * top-level scraped_at: scrape-ig-profiles-batched.ts treats a social file
 * with top-level scraped_at and no error as "IG profile already scraped"
 * and would skip the business forever. lib/data/load-social.ts tolerates
 * the minimal shape (no handle means ig: null, tiktok_mentions still loads).
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("[tt] APIFY_TOKEN missing in .env.local");
  process.exit(1);
}

const ACTOR = "clockworks~tiktok-scraper";
const SOCIAL_DIR = join(process.cwd(), "content", "social");
const RAW_DIR = join(process.cwd(), "content", "raw", "tiktok");

const CONCURRENCY = 6;
const COST_PER_QUERY = 0.005;
// Politeness pause per worker between successive runs.
const WORKER_PAUSE_MS = 1500;
// Wall-clock estimate assumption for dry-run output only.
const AVG_RUN_SECONDS = 45;
// Bounded poll: one hung actor run must not stall the whole batch. Same
// fix as scripts/scout-comment-defense.ts (POLL_CAP_MS), where a run sat
// RUNNING for 30+ minutes.
const POLL_CAP_MS = 6 * 60 * 1000;

type ApifyVideo = {
  id?: string;
  text?: string;
  createTimeISO?: string;
  webVideoUrl?: string;
  playCount?: number;
  diggCount?: number;
  shareCount?: number;
  commentCount?: number;
  authorMeta?: {
    id?: string;
    name?: string;
    nickName?: string;
    fans?: number;
    verified?: boolean;
  };
  hashtags?: Array<{ name?: string }>;
  videoMeta?: { duration?: number };
};

type CreatorAgg = {
  handle: string;
  fans: number | null;
  verified: boolean;
  videos: number;
  plays: number;
  likes: number;
};

type TopVideo = {
  id: string;
  url: string;
  text: string;
  author: string;
  plays: number;
  likes: number;
  posted: string;
};

export type TikTokMentions = {
  /** Search query that produced these results */
  query: string;
  /** Total videos returned */
  video_count: number;
  /** Sum of plays across all videos */
  total_plays: number;
  /** Sum of likes */
  total_likes: number;
  /** Unique creator count */
  unique_creators: number;
  /** Top creators by aggregated plays (descending) */
  top_creators: CreatorAgg[];
  /** Top 3 videos by plays */
  top_videos: TopVideo[];
  /** Most recent video posted (ISO) */
  most_recent_post_at: string | null;
  /** Median play count, robust to one viral outlier */
  median_plays: number;
  /** If business's own handle is in the results, this is it */
  detected_own_handle: string | null;
  /** When this was scraped */
  scraped_at: string;
};

/** One scrape candidate, sourced from the DB business catalog. */
type Candidate = {
  slug: string;
  name: string;
  neighborhood: string;
  /** Google categoryName, e.g. "Bakery", "Coffee shop". Feeds the
   *  family-context keyword check in filterRelevant. */
  category: string;
  hasSocialFile: boolean;
  hasTiktok: boolean;
};

function buildQuery(name: string, neighborhood: string | undefined): string {
  // Drop common business-name suffixes and lowercase. Apify's TikTok
  // search is forgiving but cleaner queries land more relevant videos.
  const cleaned = name
    .replace(/\b(LLC|Inc\.?|Co\.?|Company|The)\b/gi, "")
    .replace(/&/g, "and")
    .trim();
  return `${cleaned} pittsburgh`.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pull the distinguishing tokens from a business name. "Page's Ice Cream"
 * -> ["pages", "ice", "cream"]. Used by the relevance filter below to
 * decide whether a TikTok video is actually ABOUT this business.
 */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}
const STOP = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "pittsburgh",
  "shop",
  "cafe",
  "bar",
  "restaurant",
  "kitchen",
  "company",
  "house",
]);

/**
 * Filter Apify's raw result list down to videos that are
 *   (a) posted in the last 90 days, AND
 *   (b) plausibly about this business (relevance check).
 *
 * Relevance: the video's caption, hashtags, OR author handle must
 * mention at least one of the business's distinguishing tokens. This
 * kills the false positives where Apify's keyword search returns
 * unrelated videos that happened to match (e.g., "Margaux pittsburgh"
 * pulling videos about people named Margaux).
 *
 * Conservative by design. We'd rather under-count by a few than
 * publish editorial claims about creator coverage that don't survive
 * a skeptic checking the actual videos.
 */
/**
 * Pittsburgh-area markers, mirrors the strict filter in
 * scripts/generate-creator-posts.ts. A video must contain one of these
 * (caption / hashtag / author handle / nickname) to count as a real
 * Pittsburgh-relevant mention.
 */
const PITTSBURGH_MARKERS = [
  "pittsburgh", "pgh", "412", "steelcity", "yinz",
  "arlington", "bloomfield", "eastliberty", "hazelwood", "highlandpark",
  "larimer", "lawrenceville", "morningside", "shadyside", "southside",
  "southsideflats", "squirrelhill", "stripdistrict",
];

const FAMILY_CONTEXT_KEYWORDS: Record<string, string[]> = {
  Bakery: ["bakery", "pastry", "bread", "croissant", "cake", "cookie"],
  "Pastry shop": ["pastry", "bakery", "croissant", "bread"],
  "Dessert shop": ["dessert", "ice cream", "icecream", "sweet", "cake"],
  "Dessert restaurant": ["dessert", "ice cream", "sweet", "treat"],
  "Ice cream shop": ["ice cream", "icecream", "gelato", "scoop"],
  Cafe: ["coffee", "cafe", "café", "latte", "espresso", "matcha", "drink"],
  "Coffee shop": ["coffee", "cafe", "latte", "espresso", "drink", "brew"],
  "Tea house": ["tea", "matcha", "cafe", "drink"],
  "Juice shop": ["juice", "smoothie", "drink", "carrot"],
  "Noodle shop": ["noodle", "ramen", "soup", "asian"],
  "Japanese restaurant": ["sushi", "japanese", "ramen", "donburi", "rice"],
  "Sushi restaurant": ["sushi", "japanese", "rice"],
  "Thai restaurant": ["thai", "noodle", "curry", "rice"],
  "Indian restaurant": ["indian", "curry", "naan", "rice"],
  Restaurant: ["restaurant", "food", "dish", "eat", "lunch", "dinner"],
  "Brunch restaurant": ["brunch", "restaurant", "eggs", "pancakes", "breakfast"],
  Bar: ["bar", "cocktail", "drink", "beer", "wine"],
  Brewery: ["brewery", "beer", "ipa", "lager", "pint", "tap"],
};

const STOP_TOKENS = new Set([
  "and", "the", "with", "for", "from", "pittsburgh", "shop", "cafe",
  "bar", "restaurant", "kitchen", "company", "house",
]);

/**
 * Core business name: lowercased + alphanumeric-only, with neighborhood
 * suffixes stripped (e.g. "La Gourmandine Lawrenceville" -> "lagourmandine"
 * because "lawrenceville" is a tracked neighborhood marker that creators
 * commonly use without referring to the business itself).
 */
function coreBusinessName(name: string): string {
  let s = name.toLowerCase();
  for (const m of PITTSBURGH_MARKERS) {
    if (m.length < 6) continue;
    s = s.replace(new RegExp(`\\b${m}\\b`, "gi"), "");
  }
  s = s.replace(/^\s*(the|a)\s+/, "");
  return s.replace(/[^a-z0-9]/g, "");
}

/**
 * Strict 3-condition filter applied at scrape time:
 *   (a) Recency, posted in the last 90 days.
 *   (b) Explicit business name match, the core normalized business name
 *       must appear as a contiguous substring of the alphanumeric haystack
 *       (caption + hashtags + author handle + nickname). For short cores
 *       (<8 chars: 'pages', 'mola') a family-context keyword must also
 *       appear.
 *   (c) Pittsburgh area marker, caption / hashtag / handle / nickname
 *       must contain Pittsburgh, PGH, 412, or a Pittsburgh neighborhood.
 *
 * This is the same filter scripts/generate-creator-posts.ts uses, ported
 * here so the scraper's saved aggregates match what generators consume.
 * Was the looser any-token-match filter, which let Zillow real-estate
 * videos about Lawrenceville pass into La Gourmandine's data.
 */
function filterRelevant(items: ApifyVideo[], businessName: string, categoryName?: string): ApifyVideo[] {
  const core = coreBusinessName(businessName);
  if (!core) return [];
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const familyKeywords = categoryName ? FAMILY_CONTEXT_KEYWORDS[categoryName] ?? [] : [];

  return items.filter((v) => {
    // (a) Recency
    const posted = v.createTimeISO ? Date.parse(v.createTimeISO) : NaN;
    if (Number.isNaN(posted) || posted < cutoff) return false;

    const fullLower = [
      v.text ?? "",
      v.authorMeta?.name ?? "",
      v.authorMeta?.nickName ?? "",
      ...(v.hashtags ?? []).map((h) => h.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    const alphanum = fullLower.replace(/[^a-z0-9]/g, "");

    // (b) Strict business name match
    if (!alphanum.includes(core)) return false;
    // For short cores, also require a family context word to avoid generic-token false positives.
    if (core.length < 8 && familyKeywords.length > 0) {
      const tagged = fullLower.includes(`@${core}`) || fullLower.includes(`#${core}`);
      if (!tagged && !familyKeywords.some((k) => fullLower.includes(k))) {
        return false;
      }
    }

    // (c) Pittsburgh area marker
    if (!PITTSBURGH_MARKERS.some((m) => alphanum.includes(m))) return false;

    return true;
  });
}

// Old loose filter kept for reference; superseded by the strict one above.
// Was: tokens.some((t) => haystack.includes(t)) which let any partial
// match (e.g. neighborhood word) pass.
function _looseFilterRelevant_unused(items: ApifyVideo[], businessName: string): ApifyVideo[] {
  const tokens = nameTokens(businessName);
  return items.filter((v) => {
    const haystack = [
      (v.text ?? "").toLowerCase(),
      (v.authorMeta?.name ?? "").toLowerCase(),
    ].join(" ");
    return tokens.some((t) => haystack.includes(t));
  });
}

async function runActor(query: string): Promise<ApifyVideo[]> {
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/runs?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQueries: [query],
        // Was 30, that hard-capped every business at ~25-30 unique
        // creators regardless of actual coverage. Bumped to 100 so
        // viral businesses can show real differentiation.
        resultsPerPage: 100,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      }),
    },
  );
  if (!startRes.ok) {
    throw new Error(`apify start failed: ${startRes.status} ${await startRes.text()}`);
  }
  const run = ((await startRes.json()) as { data: { id: string; status: string } }).data;
  let status = run.status;
  const startedAt = Date.now();
  while (status === "READY" || status === "RUNNING") {
    if (Date.now() - startedAt > POLL_CAP_MS) {
      // Abort the hung run server-side so it stops billing, then bail.
      // The per-business catch logs this as a [fail] and the batch moves on.
      await fetch(`https://api.apify.com/v2/actor-runs/${run.id}/abort?token=${TOKEN}`, {
        method: "POST",
      }).catch(() => {});
      throw new Error(`apify run exceeded ${POLL_CAP_MS / 60000}min poll cap, aborted`);
    }
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`);
    status = ((await r2.json()) as { data: { status: string } }).data.status;
    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(`apify run ${status}`);
    }
  }
  const items = (await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${TOKEN}&format=json`,
  ).then((r) => r.json())) as ApifyVideo[];
  return items;
}

function aggregate(
  query: string,
  items: ApifyVideo[],
  businessName: string,
): TikTokMentions {
  const totalPlays = items.reduce((s, v) => s + (v.playCount ?? 0), 0);
  const totalLikes = items.reduce((s, v) => s + (v.diggCount ?? 0), 0);

  // Aggregate by creator
  const creatorMap = new Map<string, CreatorAgg>();
  for (const v of items) {
    const handle = v.authorMeta?.name;
    if (!handle) continue;
    const c = creatorMap.get(handle) ?? {
      handle,
      fans: v.authorMeta?.fans ?? null,
      verified: !!v.authorMeta?.verified,
      videos: 0,
      plays: 0,
      likes: 0,
    };
    c.videos += 1;
    c.plays += v.playCount ?? 0;
    c.likes += v.diggCount ?? 0;
    if (c.fans === null && v.authorMeta?.fans) c.fans = v.authorMeta.fans;
    creatorMap.set(handle, c);
  }
  const topCreators = Array.from(creatorMap.values())
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 8);

  // Top videos by plays
  const topVideos: TopVideo[] = items
    .slice()
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, 3)
    .map((v) => ({
      id: v.id ?? "",
      url: v.webVideoUrl ?? "",
      text: (v.text ?? "").slice(0, 240),
      author: v.authorMeta?.name ?? "",
      plays: v.playCount ?? 0,
      likes: v.diggCount ?? 0,
      posted: v.createTimeISO ?? "",
    }));

  // Most recent post
  const mostRecent =
    items
      .map((v) => v.createTimeISO ?? "")
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  // Median plays (robust to viral outliers)
  const playList = items
    .map((v) => v.playCount ?? 0)
    .sort((a, b) => a - b);
  const median = playList.length
    ? playList.length % 2 === 0
      ? Math.round((playList[playList.length / 2 - 1] + playList[playList.length / 2]) / 2)
      : playList[Math.floor(playList.length / 2)]
    : 0;

  // Heuristic: if a creator's handle resembles the business name, that's
  // likely the business's own account.
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const businessNorm = norm(businessName);
  const detectedOwn =
    Array.from(creatorMap.keys()).find((h) => {
      const hn = norm(h);
      return businessNorm.includes(hn) || hn.includes(businessNorm.slice(0, 8));
    }) ?? null;

  return {
    query,
    video_count: items.length,
    total_plays: totalPlays,
    total_likes: totalLikes,
    unique_creators: creatorMap.size,
    top_creators: topCreators,
    top_videos: topVideos,
    most_recent_post_at: mostRecent,
    median_plays: median,
    detected_own_handle: detectedOwn,
    scraped_at: new Date().toISOString(),
  };
}

// Run `worker` over `items` with at most `limit` in flight at once.
// Same pool as scripts/scrape-business-own-posts.ts.
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    },
  );
  await Promise.all(lanes);
}

function parseLimit(args: string[]): number | null {
  const eq = args.find((a) => a.startsWith("--limit="));
  if (eq) {
    const n = Number(eq.slice("--limit=".length));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }
  const i = args.indexOf("--limit");
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("[tt] --limit requires a positive number, e.g. --limit 50");
    process.exit(1);
  }
  return Math.floor(n);
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Build the candidate list from the full DB business catalog. The dynamic
 * import happens here, AFTER dotenv has populated DATABASE_URL, because
 * lib/db/client.ts throws at module-import time if it's missing (same
 * pattern as scripts/scout-comment-defense.ts).
 */
async function buildCandidates(): Promise<Candidate[]> {
  const { loadAllRichBusinesses } = await import("@/lib/query/business-query");
  const all = await loadAllRichBusinesses({ fresh: true });
  return all.map((rb) => {
    const slug = rb.artifact.business.slug;
    return {
      slug,
      name: rb.artifact.business.name,
      neighborhood: rb.artifact.business.neighborhood,
      // Google categoryName ("Bakery", "Coffee shop"), the key space
      // FAMILY_CONTEXT_KEYWORDS uses. The legacy 30-file run passed the
      // lowercase category enum, which never matched those keys.
      category: rb.artifact.meta.categoryName,
      hasSocialFile: existsSync(join(SOCIAL_DIR, `${slug}.json`)),
      hasTiktok: rb.social.tiktok_mentions !== null,
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const limit = parseLimit(args);
  // positional slug: first arg that isn't a flag and isn't the --limit value
  const limitValueIdx = args.indexOf("--limit") + 1;
  const targetSlug =
    args.find(
      (a, i) => !a.startsWith("--") && !(limitValueIdx > 0 && i === limitValueIdx),
    ) ?? null;

  await import("node:fs").then((fs) => {
    fs.mkdirSync(SOCIAL_DIR, { recursive: true });
    fs.mkdirSync(RAW_DIR, { recursive: true });
  });

  let candidates = await buildCandidates();
  if (targetSlug) {
    candidates = candidates.filter((c) => c.slug === targetSlug);
    if (candidates.length === 0) {
      console.error(`[tt] slug "${targetSlug}" not found in the business catalog`);
      process.exit(1);
    }
  }
  if (args.includes("--pool")) {
    // Restrict to the curated top-engagement pool used by the editorial
    // lists (content/raw/own-posts via the shared loader, which already
    // drops franchises/institutions and collapses shared IG handles).
    // Budget guard: full-catalog scraping measured at ~$0.22/business
    // (2026-06-10 pilot), 40x the stale $0.005 estimate in the header.
    const { loadOwnPostsPool } = await import("@/lib/lists/own-posts-pool");
    const poolSlugs = new Set((await loadOwnPostsPool()).map((r) => r.slug));
    candidates = candidates.filter((c) => poolSlugs.has(c.slug));
    console.log(`[tt] --pool restricted to ${candidates.length} curated-pool businesses`);
  }
  if (limit !== null) candidates = candidates.slice(0, limit);

  const toScrape = candidates.filter((c) => force || !c.hasTiktok);
  const skippedCached = candidates.length - toScrape.length;

  if (dryRun) {
    for (const c of candidates) {
      const query = buildQuery(c.name, c.neighborhood);
      let status: string;
      if (c.hasTiktok && !force) status = "SKIP (already has tiktok_mentions)";
      else if (c.hasTiktok && force) status = "FORCE (re-scrape)";
      else if (!c.hasSocialFile) status = "NEW (will create social file)";
      else status = "NEW";
      console.log(`[dry]  ${c.slug} :: "${query}" :: ${status}`);
    }
    const estSeconds =
      (toScrape.length * (AVG_RUN_SECONDS + WORKER_PAUSE_MS / 1000)) / CONCURRENCY;
    console.log(
      `\n[dry-run] candidates=${candidates.length} to-scrape=${toScrape.length} skip-cached=${skippedCached} new-social-files=${toScrape.filter((c) => !c.hasSocialFile).length}`,
    );
    console.log(
      `[dry-run] estimated cost: ~$${(toScrape.length * COST_PER_QUERY).toFixed(2)} (${toScrape.length} queries x $${COST_PER_QUERY.toFixed(3)}/query)`,
    );
    console.log(
      `[dry-run] estimated wall-clock: ~${formatDuration(estSeconds)} at ${CONCURRENCY} workers (assumes ~${AVG_RUN_SECONDS}s per actor run + ${WORKER_PAUSE_MS / 1000}s pause)`,
    );
    console.log("[dry-run] no Apify calls were made.");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    if (c.hasTiktok && !force) {
      console.log(`[skip] ${c.slug}, already have tiktok_mentions`);
      skipped++;
    }
  }

  await runPool(toScrape, CONCURRENCY, async (c) => {
    const socialPath = join(SOCIAL_DIR, `${c.slug}.json`);
    const rawPath = join(RAW_DIR, `${c.slug}.json`);
    const query = buildQuery(c.name, c.neighborhood);

    try {
      console.log(`[query] ${c.slug} :: "${query}"`);
      const rawItems = await runActor(query);
      const items = filterRelevant(rawItems, c.name, c.category);
      console.log(
        `[filter] ${c.slug}, kept ${items.length} of ${rawItems.length} (90-day + relevance)`,
      );
      const mentions = aggregate(query, items, c.name);

      // Save raw videos for future re-aggregation. Includes both the
      // pre-filter and post-filter sets so we can tune the filter
      // without re-scraping.
      await writeFile(
        rawPath,
        JSON.stringify(
          {
            query,
            scraped_at: mentions.scraped_at,
            raw_count: rawItems.length,
            kept_count: items.length,
            items: rawItems,
          },
          null,
          2,
        ),
      );

      // Merge into social file. Read fresh right before writing so we never
      // clobber fields written by other scripts. Missing or unreadable file
      // seeds an empty object, producing the minimal { slug, tiktok_mentions }
      // shape load-social.ts tolerates (see header note on scraped_at).
      let social: Record<string, unknown> = {};
      if (existsSync(socialPath)) {
        try {
          social = JSON.parse(await readFile(socialPath, "utf-8"));
        } catch {}
      }
      social.slug = c.slug;
      social.tiktok_mentions = mentions;
      await writeFile(socialPath, JSON.stringify(social, null, 2));

      console.log(
        `[ok]    ${c.slug}, ${mentions.video_count} videos, ${mentions.total_plays.toLocaleString()} plays, ${mentions.unique_creators} creators${
          mentions.detected_own_handle ? ` (own: @${mentions.detected_own_handle})` : ""
        }`,
      );
      processed++;
    } catch (e) {
      console.error(`[fail]  ${c.slug}:`, (e as Error).message);
      failed++;
    }

    // brief pause between runs to be polite (per worker lane)
    if (toScrape.length > 1) await new Promise((r) => setTimeout(r, WORKER_PAUSE_MS));
  });

  console.log(
    `\nDone. processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
