#!/usr/bin/env tsx
/**
 * scrape-business-own-posts.ts, pull each business's last ~30 Instagram
 * posts via Apify's instagram-scraper. Saves raw results to
 * content/raw/own-posts/<slug>.json so the BY-businesses generator can
 * flatten + filter without re-scraping.
 *
 * Cost: ~$0.001 per post * 30 posts = ~$0.03 per newly scraped profile.
 * Runtime: up to 4 profiles scrape concurrently.
 *
 * Usage:
 *   npx tsx scripts/scrape-business-own-posts.ts                 # all
 *   npx tsx scripts/scrape-business-own-posts.ts <slug>          # one business
 *   npx tsx scripts/scrape-business-own-posts.ts --force         # overwrite existing
 *   npx tsx scripts/scrape-business-own-posts.ts --top 200       # top 200 by activity x engagement
 *   npx tsx scripts/scrape-business-own-posts.ts --top 200 --dry-run  # preview selection + cost, no Apify
 *
 * --top N ranks candidates by (avg_engagement_rate * posts_30d) desc,
 * tiebreak followers desc. Excludes private accounts, missing handles,
 * and posts_30d < 1. Already-scraped slugs still count toward the top-N
 * set (the dataset is "the top N businesses", not "N new scrapes") but
 * are skipped at scrape time unless --force.
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) {
  console.error("[own-posts] APIFY_TOKEN missing in .env.local");
  process.exit(1);
}

// Apify's official Instagram scraper. resultsType=posts pulls recent
// posts from the profile URL. Reasonable scale at ~30 posts per profile.
const ACTOR = "apify~instagram-scraper";
const SOCIAL_DIR = join(process.cwd(), "content", "social");
const OUT_DIR = join(process.cwd(), "content", "raw", "own-posts");
const POSTS_PER_PROFILE = 30;
const CONCURRENCY = 4;
const COST_PER_PROFILE = 0.03; // ~30 posts * $0.001/post

type ApifyIgPost = {
  shortCode?: string;
  url?: string;
  inputUrl?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  type?: "Image" | "Sidecar" | "Video";
  productType?: string;
  timestamp?: string;
  likesCount?: number;
  commentsCount?: number;
  videoPlayCount?: number;
  videoViewCount?: number;
  displayUrl?: string;
  videoUrl?: string;
  alt?: string;
  isPinned?: boolean;
  error?: string;
};

type SocialRecord = {
  slug: string;
  handle: string | null;
  followers: number;
  posts_30d: number;
  avg_engagement_rate: number;
  isPrivate: boolean;
  alreadyScraped: boolean;
};

async function runActor(handle: string): Promise<ApifyIgPost[]> {
  const url = `https://www.instagram.com/${handle}/`;
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR}/runs?token=${TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [url],
        resultsType: "posts",
        resultsLimit: POSTS_PER_PROFILE,
        searchType: "user",
        searchLimit: 1,
        addParentData: false,
      }),
    },
  );
  if (!startRes.ok) {
    throw new Error(
      `apify start failed for @${handle}: ${startRes.status} ${await startRes.text()}`,
    );
  }
  const run = ((await startRes.json()) as {
    data: { id: string; status: string };
  }).data;
  let status = run.status;
  while (status === "READY" || status === "RUNNING") {
    await new Promise((r) => setTimeout(r, 3000));
    const r2 = await fetch(
      `https://api.apify.com/v2/actor-runs/${run.id}?token=${TOKEN}`,
    );
    status = ((await r2.json()) as { data: { status: string } }).data.status;
    if (
      status === "FAILED" ||
      status === "ABORTED" ||
      status === "TIMED-OUT"
    ) {
      throw new Error(`apify run ${status} for @${handle}`);
    }
  }
  const items = (await fetch(
    `https://api.apify.com/v2/actor-runs/${run.id}/dataset/items?token=${TOKEN}&format=json`,
  ).then((r) => r.json())) as ApifyIgPost[];
  return items;
}

// Run `worker` over `items` with at most `limit` in flight at once.
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

function parseTopN(args: string[]): number | null {
  const eq = args.find((a) => a.startsWith("--top="));
  if (eq) {
    const n = Number(eq.slice("--top=".length));
    // Invalid equals-form must fail loudly: returning null here means
    // UNLIMITED downstream, the opposite of what the caller asked for.
    if (!Number.isFinite(n) || n <= 0) {
      console.error("[own-posts] --top requires a positive number, e.g. --top 200");
      process.exit(1);
    }
    return Math.floor(n);
  }
  const i = args.indexOf("--top");
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("[own-posts] --top requires a positive number, e.g. --top 200");
    process.exit(1);
  }
  return Math.floor(n);
}

async function loadSocialRecords(force: boolean): Promise<SocialRecord[]> {
  const socialFiles = (await readdir(SOCIAL_DIR)).filter((f) =>
    f.endsWith(".json"),
  );
  const records: SocialRecord[] = [];
  for (const file of socialFiles) {
    const slug = file.replace(/\.json$/, "");
    let social: {
      handle?: string;
      followers?: number;
      posts_30d?: number;
      avg_engagement_rate?: number | null;
      private?: boolean;
    };
    try {
      social = JSON.parse(await readFile(join(SOCIAL_DIR, file), "utf-8"));
    } catch {
      console.log(`[skip] ${slug}, unreadable social file`);
      continue;
    }
    records.push({
      slug,
      handle: typeof social.handle === "string" && social.handle ? social.handle : null,
      followers: typeof social.followers === "number" ? social.followers : 0,
      posts_30d: typeof social.posts_30d === "number" ? social.posts_30d : 0,
      // null/missing engagement rate counts as 0
      avg_engagement_rate:
        typeof social.avg_engagement_rate === "number"
          ? social.avg_engagement_rate
          : 0,
      isPrivate: social.private === true,
      alreadyScraped:
        existsSync(join(OUT_DIR, `${slug}.json`)) && !force,
    });
  }
  return records;
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const topN = parseTopN(args);
  // positional slug: first arg that isn't a flag and isn't the --top value
  const topValueIdx = args.indexOf("--top") + 1;
  const targetSlug =
    args.find(
      (a, i) => !a.startsWith("--") && !(topValueIdx > 0 && i === topValueIdx),
    ) ?? null;

  await mkdir(OUT_DIR, { recursive: true });

  let records = await loadSocialRecords(force);
  if (targetSlug) records = records.filter((r) => r.slug === targetSlug);

  if (topN !== null) {
    // Eligibility: public account, has handle, posted in the last 30 days.
    // Rank by activity x resonance proxy, tiebreak by audience size.
    records = records
      .filter((r) => !r.isPrivate && r.handle && r.posts_30d >= 1)
      .sort((a, b) => {
        const scoreA = a.avg_engagement_rate * a.posts_30d;
        const scoreB = b.avg_engagement_rate * b.posts_30d;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return b.followers - a.followers;
      })
      .slice(0, topN);
  }

  if (dryRun) {
    let newCount = 0,
      scrapedCount = 0,
      noHandleCount = 0;
    for (const r of records) {
      if (!r.handle) {
        console.log(`[dry]  ${r.slug}, no IG handle (would skip)`);
        noHandleCount++;
        continue;
      }
      const score = (r.avg_engagement_rate * r.posts_30d).toFixed(4);
      const status = r.alreadyScraped ? "already scraped" : "NEW";
      if (r.alreadyScraped) scrapedCount++;
      else newCount++;
      console.log(
        `[dry]  ${r.slug} :: @${r.handle} posts_30d=${r.posts_30d} eng=${r.avg_engagement_rate} score=${score} ${status}`,
      );
    }
    console.log(
      `\n[dry-run] selected=${records.length} new=${newCount} already-scraped=${scrapedCount} no-handle=${noHandleCount}`,
    );
    console.log(
      `[dry-run] estimated cost: ~$${(newCount * COST_PER_PROFILE).toFixed(2)} (${newCount} profiles x ~$${COST_PER_PROFILE.toFixed(2)} at ${POSTS_PER_PROFILE} posts x $0.001/post)`,
    );
    return;
  }

  let processed = 0,
    skipped = 0,
    failed = 0;

  const toScrape: SocialRecord[] = [];
  for (const r of records) {
    if (!r.handle) {
      console.log(`[skip] ${r.slug}, no IG handle`);
      skipped++;
      continue;
    }
    if (r.alreadyScraped) {
      console.log(`[skip] ${r.slug}, already scraped (use --force to overwrite)`);
      skipped++;
      continue;
    }
    toScrape.push(r);
  }

  await runPool(toScrape, CONCURRENCY, async (r) => {
    const handle = r.handle as string;
    const outPath = join(OUT_DIR, `${r.slug}.json`);
    console.log(`[scrape] ${r.slug} :: @${handle}`);
    try {
      const items = await runActor(handle);
      // Some actors return an error stub for private/non-existent profiles.
      // Filter those, but keep the file with the marker so we don't retry.
      const realPosts = items.filter((i) => !i.error && i.shortCode);
      console.log(
        `[ok]    ${r.slug}, ${realPosts.length} posts pulled (raw count ${items.length})`,
      );
      await writeFile(
        outPath,
        JSON.stringify(
          {
            slug: r.slug,
            handle,
            scraped_at: new Date().toISOString(),
            raw_count: items.length,
            real_count: realPosts.length,
            items,
          },
          null,
          2,
        ),
      );
      processed++;
    } catch (err) {
      console.error(`[fail] ${r.slug}:`, err);
      failed++;
    }
  });

  console.log(
    `\n[done] processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((err) => {
  console.error("[own-posts] fatal:", err);
  process.exit(1);
});
