#!/usr/bin/env tsx
/**
 * scrape-business-own-posts.ts, pull each business's last ~30 Instagram
 * posts via Apify's instagram-scraper. Saves raw results to
 * content/raw/own-posts/<slug>.json so the BY-businesses generator can
 * flatten + filter without re-scraping.
 *
 * Cost: ~$0.001 per post * 30 posts * 29 profiles = ~$0.90.
 * Runtime: ~3-5 min for all 29 profiles.
 *
 * Usage:
 *   npx tsx scripts/scrape-business-own-posts.ts             # all
 *   npx tsx scripts/scrape-business-own-posts.ts <slug>      # one business
 *   npx tsx scripts/scrape-business-own-posts.ts --force     # overwrite existing
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

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const targetSlug = args.find((a) => !a.startsWith("--")) ?? null;

  await mkdir(OUT_DIR, { recursive: true });

  const socialFiles = (await readdir(SOCIAL_DIR)).filter((f) =>
    f.endsWith(".json"),
  );

  let processed = 0,
    skipped = 0,
    failed = 0;

  for (const file of socialFiles) {
    const slug = file.replace(/\.json$/, "");
    if (targetSlug && slug !== targetSlug) continue;

    const social = JSON.parse(
      await readFile(join(SOCIAL_DIR, file), "utf-8"),
    ) as { handle?: string; full_name?: string };

    const handle = social.handle;
    if (!handle) {
      console.log(`[skip] ${slug}, no IG handle`);
      skipped++;
      continue;
    }

    const outPath = join(OUT_DIR, `${slug}.json`);
    if (existsSync(outPath) && !force) {
      console.log(`[skip] ${slug}, already scraped (use --force to overwrite)`);
      skipped++;
      continue;
    }

    console.log(`[scrape] ${slug} :: @${handle}`);
    try {
      const items = await runActor(handle);
      // Some actors return an error stub for private/non-existent profiles.
      // Filter those, but keep the file with the marker so we don't retry.
      const realPosts = items.filter((i) => !i.error && i.shortCode);
      console.log(
        `[ok]    ${slug}, ${realPosts.length} posts pulled (raw count ${items.length})`,
      );
      await writeFile(
        outPath,
        JSON.stringify(
          {
            slug,
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
      console.error(`[fail] ${slug}:`, err);
      failed++;
    }
  }

  console.log(
    `\n[done] processed=${processed} skipped=${skipped} failed=${failed}`,
  );
}

main().catch((err) => {
  console.error("[own-posts] fatal:", err);
  process.exit(1);
});
