#!/usr/bin/env tsx
/**
 * reaggregate-tiktok-strict.ts, re-runs the TikTok aggregation against
 * existing raw data using the new strict filter (90 days + explicit
 * business name as substring + Pittsburgh marker), without re-scraping.
 *
 * Why: the original scraper used a loose ANY-token filter, which let
 * Zillow real-estate videos about "Lawrenceville Pittsburgh" pass into
 * La Gourmandine Lawrenceville's data because "lawrenceville" is one of
 * the business name tokens. Strict filter requires the contiguous core
 * name ("lagourmandine") in the haystack, which kills those false
 * positives.
 *
 * Run after updating scrape-tiktok-mentions.ts filterRelevant logic, or
 * any time the strict filter changes.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SOCIAL_DIR = join(process.cwd(), "content", "social");
const RAW_DIR = join(process.cwd(), "content", "raw", "tiktok");
const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");

type RawItem = {
  id?: string;
  text?: string;
  webVideoUrl?: string;
  createTimeISO?: string;
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
};

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

function coreBusinessName(name: string): string {
  let s = name.toLowerCase();
  for (const m of PITTSBURGH_MARKERS) {
    if (m.length < 6) continue;
    s = s.replace(new RegExp(`\\b${m}\\b`, "gi"), "");
  }
  s = s.replace(/^\s*(the|a)\s+/, "");
  return s.replace(/[^a-z0-9]/g, "");
}

function strictFilter(
  items: RawItem[],
  businessName: string,
  categoryName: string,
): RawItem[] {
  const core = coreBusinessName(businessName);
  if (!core) return [];
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const familyKeywords = FAMILY_CONTEXT_KEYWORDS[categoryName] ?? [];

  return items.filter((v) => {
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

    if (!alphanum.includes(core)) return false;
    if (core.length < 8 && familyKeywords.length > 0) {
      const tagged = fullLower.includes(`@${core}`) || fullLower.includes(`#${core}`);
      if (!tagged && !familyKeywords.some((k) => fullLower.includes(k))) {
        return false;
      }
    }

    if (!PITTSBURGH_MARKERS.some((m) => alphanum.includes(m))) return false;
    return true;
  });
}

type CreatorAgg = {
  handle: string;
  fans: number | null;
  verified: boolean;
  videos: number;
  plays: number;
  likes: number;
  top_video_url?: string;
  top_video_plays?: number;
};

function aggregate(items: RawItem[], _businessName: string) {
  const totalPlays = items.reduce((s, v) => s + (v.playCount ?? 0), 0);
  const totalLikes = items.reduce((s, v) => s + (v.diggCount ?? 0), 0);

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
    // Track this creator's top video
    const plays = v.playCount ?? 0;
    if (plays > (c.top_video_plays ?? 0) && v.webVideoUrl) {
      c.top_video_url = v.webVideoUrl;
      c.top_video_plays = plays;
    }
    creatorMap.set(handle, c);
  }
  const topCreators = Array.from(creatorMap.values())
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 8)
    .map((c) => {
      // Strip the working field before write
      const { top_video_plays: _drop, ...rest } = c;
      void _drop;
      return rest;
    });

  const topVideos = items
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

  const mostRecent =
    items.map((v) => v.createTimeISO ?? "").filter(Boolean).sort().reverse()[0] ?? null;

  const playList = items.map((v) => v.playCount ?? 0).sort((a, b) => a - b);
  const median = playList.length
    ? playList.length % 2 === 0
      ? Math.round((playList[playList.length / 2 - 1] + playList[playList.length / 2]) / 2)
      : playList[Math.floor(playList.length / 2)]
    : 0;

  return {
    video_count: items.length,
    total_plays: totalPlays,
    total_likes: totalLikes,
    unique_creators: creatorMap.size,
    top_creators: topCreators,
    top_videos: topVideos,
    most_recent_post_at: mostRecent,
    median_plays: median,
  };
}

async function main() {
  const slugArg = process.argv[2];
  if (!existsSync(RAW_DIR)) {
    console.error(`[reaggregate] no raw dir at ${RAW_DIR}`);
    process.exit(1);
  }

  const files = (await readdir(SOCIAL_DIR)).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_") && (!slugArg || f === `${slugArg}.json`),
  );

  let updated = 0,
    skipped = 0;
  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const socialPath = join(SOCIAL_DIR, f);
    const rawPath = join(RAW_DIR, `${slug}.json`);
    const bizPath = join(BUSINESSES_DIR, `${slug}.json`);

    if (!existsSync(rawPath) || !existsSync(bizPath)) {
      skipped++;
      continue;
    }

    const social = JSON.parse(await readFile(socialPath, "utf-8")) as Record<string, unknown> & {
      tiktok_mentions?: { detected_own_handle?: string | null; query?: string; scraped_at?: string };
    };
    const biz = JSON.parse(await readFile(bizPath, "utf-8")) as { name: string; category?: string };
    const raw = JSON.parse(await readFile(rawPath, "utf-8")) as { items: RawItem[]; query?: string };

    // Find Google categoryName from artifact-level _meta (where we store it)
    const meta = (social as unknown as { _meta?: { categoryName?: string } })._meta;
    const categoryName = meta?.categoryName ?? biz.category ?? "";
    // Actually _meta is on the BUSINESS file, not social. Pull it from biz JSON.
    const bizFull = JSON.parse(await readFile(bizPath, "utf-8")) as { _meta?: { categoryName?: string } };
    const realCategory = bizFull._meta?.categoryName ?? categoryName;

    const before = raw.items.length;
    const filtered = strictFilter(raw.items, biz.name, realCategory);
    const detectedOwn = social.tiktok_mentions?.detected_own_handle ?? null;

    const newAgg = aggregate(filtered, biz.name);
    const newMentions = {
      query: raw.query ?? social.tiktok_mentions?.query ?? "",
      ...newAgg,
      detected_own_handle: detectedOwn,
      scraped_at: social.tiktok_mentions?.scraped_at ?? new Date().toISOString(),
    };

    social.tiktok_mentions = newMentions;
    await writeFile(socialPath, JSON.stringify(social, null, 2));

    console.log(
      `[reaggregate] ${slug}: ${before} raw -> ${filtered.length} kept, ${newAgg.unique_creators} creators`,
    );
    updated++;
  }

  console.log(`\n[reaggregate] done. updated=${updated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error("[reaggregate-strict] fatal:", err);
  process.exit(1);
});
