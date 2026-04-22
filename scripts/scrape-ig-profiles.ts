#!/usr/bin/env tsx
/**
 * Scrape Instagram profile details + recent posts for every discovered handle.
 *
 * Actor: apify/instagram-scraper (shu8hvrXbJbY3Eb9W)
 * Single run with all directUrls — much cheaper than N runs.
 *
 * Output (per business):
 *   content/social/<slug>.json = {
 *     slug, handle, followers, posts_total, posts_30d, reels_30d,
 *     avg_engagement_rate, verified, private, biography, last_post_at,
 *     scraped_at
 *   }
 *
 * Budget cap: abort if the run exceeds $8 in compute units.
 *
 * Privacy: we do NOT persist post captions, commenter usernames, or any
 * individual-post body. Only aggregate counts + profile-level metadata.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("APIFY_TOKEN missing from .env.local");
  process.exit(1);
}

const PROJECT_ROOT = resolve(__dirname, "..");
const SOCIAL_DIR = join(PROJECT_ROOT, "content", "social");
const HANDLES_PATH = join(SOCIAL_DIR, "handles.json");

const ACTOR_ID = "apify~instagram-scraper";

interface HandleRecord {
  slug: string;
  name: string;
  instagram_handle: string | null;
}

interface ProfilePost {
  type?: string; // "Image", "Sidecar", "Video"
  productType?: string; // "clips" for reels
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string; // ISO
  videoViewCount?: number;
}

interface ScrapedProfile {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
  verified?: boolean;
  private?: boolean;
  isBusinessAccount?: boolean;
  latestPosts?: ProfilePost[];
  url?: string;
  inputUrl?: string;
  error?: string;
  errorDescription?: string;
}

async function startRun(urls: string[]): Promise<string> {
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`;
  const body = {
    directUrls: urls,
    resultsType: "details",
    resultsLimit: 10,
    addParentData: false,
    enhanceUserSearchWithFacebookPage: false,
    searchType: "user",
    searchLimit: 1,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`start run failed ${res.status}: ${t}`);
  }
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function waitForRun(runId: string, budgetUsd = 8): Promise<{ datasetId: string; costUsd: number }> {
  const url = `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(url);
    if (!res.ok) continue;
    const { data } = (await res.json()) as {
      data: {
        status: string;
        defaultDatasetId: string;
        usageTotalUsd?: number;
        stats?: { computeUnits?: number };
      };
    };
    const cost = data.usageTotalUsd ?? (data.stats?.computeUnits ?? 0) * 0.25;
    process.stdout.write(
      `\r[run] status=${data.status} cost=$${cost.toFixed(3)}        `,
    );
    if (cost > budgetUsd) {
      await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/abort?token=${APIFY_TOKEN}`,
        { method: "POST" },
      );
      throw new Error(`Aborted — run exceeded $${budgetUsd} cap at $${cost.toFixed(2)}`);
    }
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(data.status)) {
      process.stdout.write("\n");
      if (data.status !== "SUCCEEDED") throw new Error(`Run ended: ${data.status}`);
      return { datasetId: data.defaultDatasetId, costUsd: cost };
    }
  }
  throw new Error("Run timed out waiting");
}

async function fetchDataset(datasetId: string): Promise<ScrapedProfile[]> {
  const url =
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dataset fetch ${res.status}`);
  return (await res.json()) as ScrapedProfile[];
}

function summarizeProfile(p: ScrapedProfile, scrapedAt: string): {
  posts_30d: number;
  reels_30d: number;
  avg_engagement_rate: number;
  last_post_at: string | null;
} {
  const posts = p.latestPosts ?? [];
  const now = new Date(scrapedAt).getTime();
  const within30 = posts.filter((x) => {
    if (!x.timestamp) return false;
    return now - new Date(x.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000;
  });
  const reels_30d = within30.filter((x) => x.productType === "clips" || x.type === "Video").length;

  const followers = p.followersCount ?? 0;
  let engagement = 0;
  if (followers > 0 && posts.length > 0) {
    const sampled = posts.slice(0, 10);
    const totals = sampled.reduce(
      (acc, x) => acc + (x.likesCount ?? 0) + (x.commentsCount ?? 0),
      0,
    );
    const avgPerPost = totals / sampled.length;
    engagement = avgPerPost / followers;
  }

  const lastPost = posts
    .map((x) => x.timestamp)
    .filter((t): t is string => !!t)
    .sort()
    .pop() ?? null;

  return {
    posts_30d: within30.length,
    reels_30d,
    avg_engagement_rate: Number(engagement.toFixed(5)),
    last_post_at: lastPost,
  };
}

async function main(): Promise<void> {
  const handles = JSON.parse(await readFile(HANDLES_PATH, "utf8")) as HandleRecord[];
  const withHandles = handles.filter((h) => h.instagram_handle);
  // Dedupe — multiple businesses can share a handle (e.g. both La Gourmandine
  // locations use @lagourmandinebakery). One scrape result feeds both records.
  const uniqueHandles = [...new Set(withHandles.map((h) => h.instagram_handle!.toLowerCase()))];
  const urls = uniqueHandles.map((h) => `https://www.instagram.com/${h}/`);

  console.log(`[scrape] scraping ${urls.length} unique profiles (${withHandles.length} businesses)...`);
  console.log(`[scrape] URLs: ${urls.slice(0, 3).join(", ")}...`);

  const runId = await startRun(urls);
  console.log(`[scrape] run id: ${runId}`);

  const { datasetId, costUsd } = await waitForRun(runId, 8);
  console.log(`[scrape] dataset ${datasetId} — cost $${costUsd.toFixed(3)}`);

  const items = await fetchDataset(datasetId);
  console.log(`[scrape] fetched ${items.length} items`);

  // Index results by the inputUrl or username
  const byHandle = new Map<string, ScrapedProfile>();
  for (const item of items) {
    const u = (item.username ?? "").toLowerCase();
    if (u) byHandle.set(u, item);
    // Also index by inputUrl's trailing segment
    if (item.inputUrl) {
      const m = /instagram\.com\/([a-zA-Z0-9._]+)/i.exec(item.inputUrl);
      if (m) byHandle.set(m[1].toLowerCase(), item);
    }
  }

  const scrapedAt = new Date().toISOString();
  let wrote = 0;
  const summary: { slug: string; handle: string; followers: number; posts_30d: number; reels_30d: number; engagement: string; private?: boolean; error?: string }[] = [];

  for (const h of withHandles) {
    const handle = h.instagram_handle!.toLowerCase();
    const p = byHandle.get(handle);
    if (!p) {
      summary.push({ slug: h.slug, handle, followers: 0, posts_30d: 0, reels_30d: 0, engagement: "?", error: "no result" });
      continue;
    }
    if (p.error) {
      const existing = existsSync(join(SOCIAL_DIR, `${h.slug}.json`))
        ? JSON.parse(await readFile(join(SOCIAL_DIR, `${h.slug}.json`), "utf8"))
        : {};
      const record = {
        ...existing,
        slug: h.slug,
        handle,
        error: p.error,
        errorDescription: p.errorDescription ?? null,
        scraped_at: scrapedAt,
      };
      await writeFile(
        join(SOCIAL_DIR, `${h.slug}.json`),
        JSON.stringify(record, null, 2) + "\n",
        "utf8",
      );
      summary.push({ slug: h.slug, handle, followers: 0, posts_30d: 0, reels_30d: 0, engagement: "?", error: p.error });
      continue;
    }

    const stats = summarizeProfile(p, scrapedAt);
    const record = {
      slug: h.slug,
      handle,
      followers: p.followersCount ?? 0,
      follows: p.followsCount ?? 0,
      posts_total: p.postsCount ?? 0,
      posts_30d: stats.posts_30d,
      reels_30d: stats.reels_30d,
      avg_engagement_rate: stats.avg_engagement_rate,
      verified: p.verified ?? false,
      private: p.private ?? false,
      is_business_account: p.isBusinessAccount ?? false,
      biography: (p.biography ?? "").slice(0, 500),
      full_name: (p.fullName ?? "").slice(0, 200),
      last_post_at: stats.last_post_at,
      scraped_at: scrapedAt,
    };

    // Preserve any existing growth field, to be filled by compute-growth script
    const existing = existsSync(join(SOCIAL_DIR, `${h.slug}.json`))
      ? JSON.parse(await readFile(join(SOCIAL_DIR, `${h.slug}.json`), "utf8"))
      : null;

    await writeFile(
      join(SOCIAL_DIR, `${h.slug}.json`),
      JSON.stringify({ ...record, growth: existing?.growth ?? null }, null, 2) + "\n",
      "utf8",
    );
    wrote += 1;
    summary.push({
      slug: h.slug,
      handle,
      followers: record.followers,
      posts_30d: record.posts_30d,
      reels_30d: record.reels_30d,
      engagement: (record.avg_engagement_rate * 100).toFixed(2) + "%",
      private: record.private,
    });
  }

  console.log(`\n[scrape] wrote ${wrote}/${withHandles.length} records`);
  console.log("\nSummary:");
  for (const s of summary) {
    const tag = s.error ? `ERR: ${s.error}` : s.private ? "PRIVATE" : `f=${s.followers} p30=${s.posts_30d} r30=${s.reels_30d} eng=${s.engagement}`;
    console.log(`  ${s.slug.padEnd(45)} @${s.handle.padEnd(30)} ${tag}`);
  }

  await writeFile(
    join(SOCIAL_DIR, "_scrape-run.json"),
    JSON.stringify({ run_id: runId, dataset_id: datasetId, cost_usd: costUsd, scraped_at: scrapedAt }, null, 2) + "\n",
    "utf8",
  );
  console.log(`\n[scrape] total Apify cost this run: $${costUsd.toFixed(3)}`);
}

main().catch((e) => {
  console.error("\n[scrape] error:", (e as Error).message);
  process.exit(1);
});
