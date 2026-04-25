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
 * Cost: about $0.005 per query × 30 businesses = $0.15.
 *
 * Run:
 *   npx tsx scripts/scrape-tiktok-mentions.ts                # all
 *   npx tsx scripts/scrape-tiktok-mentions.ts <slug>         # one business
 *   npx tsx scripts/scrape-tiktok-mentions.ts --force        # overwrite cache
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
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
const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");
const SOCIAL_DIR = join(process.cwd(), "content", "social");
const RAW_DIR = join(process.cwd(), "content", "raw", "tiktok");

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

function buildQuery(name: string, neighborhood: string | undefined): string {
  // Drop common business-name suffixes and lowercase. Apify's TikTok
  // search is forgiving but cleaner queries land more relevant videos.
  const cleaned = name
    .replace(/\b(LLC|Inc\.?|Co\.?|Company|The)\b/gi, "")
    .replace(/&/g, "and")
    .trim();
  return `${cleaned} pittsburgh`.toLowerCase().replace(/\s+/g, " ");
}

async function runActor(query: string): Promise<ApifyVideo[]> {
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/runs?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQueries: [query],
        resultsPerPage: 30,
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
  while (status === "READY" || status === "RUNNING") {
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

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  await import("node:fs").then((fs) => {
    fs.mkdirSync(SOCIAL_DIR, { recursive: true });
    fs.mkdirSync(RAW_DIR, { recursive: true });
  });

  const files = (await readdir(BUSINESSES_DIR)).filter((f) =>
    f.endsWith(".json"),
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const socialPath = join(SOCIAL_DIR, `${slug}.json`);
    const rawPath = join(RAW_DIR, `${slug}.json`);

    // Load existing social record (or empty seed)
    let social: Record<string, unknown> = {};
    if (existsSync(socialPath)) {
      try {
        social = JSON.parse(await readFile(socialPath, "utf-8"));
      } catch {}
    }

    if (!force && social.tiktok_mentions) {
      console.log(`[skip] ${slug}, already have tiktok_mentions`);
      skipped++;
      continue;
    }

    const record = JSON.parse(
      await readFile(join(BUSINESSES_DIR, file), "utf-8"),
    );
    const query = buildQuery(record.name, record.neighborhood);

    try {
      console.log(`[query] ${slug} :: "${query}"`);
      const items = await runActor(query);
      const mentions = aggregate(query, items, record.name);

      // Save raw videos for future re-aggregation
      await writeFile(
        rawPath,
        JSON.stringify({ query, scraped_at: mentions.scraped_at, items }, null, 2),
      );

      // Merge into social file
      social.slug = slug;
      social.tiktok_mentions = mentions;
      await writeFile(socialPath, JSON.stringify(social, null, 2));

      console.log(
        `[ok]    ${slug}, ${mentions.video_count} videos, ${mentions.total_plays.toLocaleString()} plays, ${mentions.unique_creators} creators${
          mentions.detected_own_handle ? ` (own: @${mentions.detected_own_handle})` : ""
        }`,
      );
      processed++;
    } catch (e) {
      console.error(`[fail]  ${slug}:`, (e as Error).message);
      failed++;
    }

    // brief pause between runs to be polite
    if (!targetSlug) await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(
    `\nDone. processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
