#!/usr/bin/env tsx
/**
 * Batched IG profile scrape for the full handles.json (not just the 30 pilot).
 *
 * Wraps scrape-ig-profiles.ts logic but processes handles in batches of
 * BATCH_SIZE (default 200), each its own Apify run with its own cost cap.
 * Writes per-slug social/<slug>.json after every batch so partial progress
 * survives a crash.
 *
 * Skips handles that already have a social/<slug>.json with no error and
 * a recent scraped_at (so reruns don't redo work).
 *
 * Env:
 *   BATCH_SIZE        default 200
 *   BATCH_BUDGET_USD  default 40 (per Apify run)
 *   TOTAL_BUDGET_USD  default 250 (abort whole script if exceeded)
 *   WAIT_TIMEOUT_SEC  default 3600 (per-batch run timeout, 1 hour)
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) { console.error("APIFY_TOKEN missing"); process.exit(1); }

const PROJECT_ROOT = resolve(__dirname, "..");
const SOCIAL_DIR = join(PROJECT_ROOT, "content", "social");
const HANDLES_PATH = join(SOCIAL_DIR, "handles.json");

const ACTOR_ID = "apify~instagram-scraper";

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "200", 10);
const BATCH_BUDGET_USD = parseFloat(process.env.BATCH_BUDGET_USD ?? "40");
const TOTAL_BUDGET_USD = parseFloat(process.env.TOTAL_BUDGET_USD ?? "250");
const WAIT_TIMEOUT_SEC = parseInt(process.env.WAIT_TIMEOUT_SEC ?? "3600", 10);

interface HandleRecord { slug: string; name: string; instagram_handle: string | null; }
interface ProfilePost {
  type?: string;
  productType?: string;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
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
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); throw new Error(`start run failed ${res.status}: ${t}`); }
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

async function waitForRun(runId: string, budgetUsd: number, timeoutSec: number): Promise<{ datasetId: string; costUsd: number }> {
  const url = `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`;
  const maxIters = Math.ceil(timeoutSec / 5);
  for (let i = 0; i < maxIters; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(url);
    if (!res.ok) continue;
    const { data } = (await res.json()) as {
      data: { status: string; defaultDatasetId: string; usageTotalUsd?: number; stats?: { computeUnits?: number } };
    };
    const cost = data.usageTotalUsd ?? (data.stats?.computeUnits ?? 0) * 0.25;
    if (i % 6 === 0) {
      process.stdout.write(`\r[run ${runId.slice(0,8)}] ${i*5}s status=${data.status} cost=$${cost.toFixed(2)}        `);
    }
    if (cost > budgetUsd) {
      await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort?token=${APIFY_TOKEN}`, { method: "POST" });
      throw new Error(`Aborted, run exceeded $${budgetUsd} at $${cost.toFixed(2)}`);
    }
    if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(data.status)) {
      process.stdout.write("\n");
      if (data.status !== "SUCCEEDED") throw new Error(`Run ended: ${data.status}`);
      return { datasetId: data.defaultDatasetId, costUsd: cost };
    }
  }
  throw new Error(`Run timed out waiting (${timeoutSec}s)`);
}

async function fetchDataset(datasetId: string): Promise<ScrapedProfile[]> {
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&format=json&clean=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dataset fetch ${res.status}`);
  return (await res.json()) as ScrapedProfile[];
}

function summarizeProfile(p: ScrapedProfile, scrapedAt: string) {
  const posts = p.latestPosts ?? [];
  const now = new Date(scrapedAt).getTime();
  const within30 = posts.filter((x) => x.timestamp && now - new Date(x.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000);
  const reels_30d = within30.filter((x) => x.productType === "clips" || x.type === "Video").length;
  const followers = p.followersCount ?? 0;
  let engagement = 0;
  if (followers > 0 && posts.length > 0) {
    const sampled = posts.slice(0, 10);
    const totals = sampled.reduce((acc, x) => acc + (x.likesCount ?? 0) + (x.commentsCount ?? 0), 0);
    engagement = totals / sampled.length / followers;
  }
  const lastPost = posts.map((x) => x.timestamp).filter((t): t is string => !!t).sort().pop() ?? null;
  return { posts_30d: within30.length, reels_30d, avg_engagement_rate: Number(engagement.toFixed(5)), last_post_at: lastPost };
}

async function processBatch(batch: HandleRecord[], scrapedAt: string): Promise<{ wrote: number; cost: number; runId: string; datasetId: string }> {
  const uniqueHandles = [...new Set(batch.map((h) => h.instagram_handle!.toLowerCase()))];
  const urls = uniqueHandles.map((h) => `https://www.instagram.com/${h}/`);
  console.log(`  [batch] ${urls.length} URLs, ${batch.length} business mappings`);

  const runId = await startRun(urls);
  const { datasetId, costUsd } = await waitForRun(runId, BATCH_BUDGET_USD, WAIT_TIMEOUT_SEC);
  console.log(`  [batch] dataset ${datasetId}, cost $${costUsd.toFixed(3)}`);

  const items = await fetchDataset(datasetId);
  const byHandle = new Map<string, ScrapedProfile>();
  for (const item of items) {
    const u = (item.username ?? "").toLowerCase();
    if (u) byHandle.set(u, item);
    if (item.inputUrl) {
      const m = /instagram\.com\/([a-zA-Z0-9._]+)/i.exec(item.inputUrl);
      if (m) byHandle.set(m[1].toLowerCase(), item);
    }
  }

  let wrote = 0;
  let hit = 0, miss = 0, errs = 0;
  for (const h of batch) {
    const handle = h.instagram_handle!.toLowerCase();
    const p = byHandle.get(handle);
    const slugPath = join(SOCIAL_DIR, `${h.slug}.json`);
    if (!p) {
      // No result, write a stub so we don't re-query next time
      const stub = { slug: h.slug, handle, error: "no_result", scraped_at: scrapedAt };
      await writeFile(slugPath, JSON.stringify(stub, null, 2) + "\n", "utf8");
      miss++;
      continue;
    }
    if (p.error) {
      const existing = existsSync(slugPath) ? JSON.parse(await readFile(slugPath, "utf8")) : {};
      const record = { ...existing, slug: h.slug, handle, error: p.error, errorDescription: p.errorDescription ?? null, scraped_at: scrapedAt };
      await writeFile(slugPath, JSON.stringify(record, null, 2) + "\n", "utf8");
      errs++;
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
    const existing = existsSync(slugPath) ? JSON.parse(await readFile(slugPath, "utf8")) : null;
    await writeFile(slugPath, JSON.stringify({ ...record, growth: existing?.growth ?? null }, null, 2) + "\n", "utf8");
    hit++;
    wrote++;
  }
  console.log(`  [batch] wrote=${hit} miss=${miss} err=${errs}`);
  return { wrote, cost: costUsd, runId, datasetId };
}

async function main(): Promise<void> {
  const handles = JSON.parse(await readFile(HANDLES_PATH, "utf8")) as HandleRecord[];
  const withHandles = handles.filter((h) => h.instagram_handle);
  console.log(`[scrape-all] ${withHandles.length} handles total`);

  // Skip handles we already have valid social/<slug>.json for. We treat a
  // valid record as one whose error field is unset and that has a
  // scraped_at field (i.e. not just our discovery stub).
  const todo: HandleRecord[] = [];
  for (const h of withHandles) {
    const p = join(SOCIAL_DIR, `${h.slug}.json`);
    if (existsSync(p)) {
      try {
        const obj = JSON.parse(await readFile(p, "utf8"));
        if (obj.scraped_at && !obj.error) continue;
      } catch {}
    }
    todo.push(h);
  }
  console.log(`[scrape-all] ${todo.length} to scrape (skipping ${withHandles.length - todo.length} already done)`);

  if (todo.length === 0) {
    console.log("[scrape-all] nothing to do");
    return;
  }

  const scrapedAt = new Date().toISOString();
  let totalCost = 0;
  let totalWrote = 0;
  const batches: HandleRecord[][] = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));
  console.log(`[scrape-all] ${batches.length} batches of <=${BATCH_SIZE}`);

  for (let i = 0; i < batches.length; i++) {
    console.log(`\n[batch ${i + 1}/${batches.length}]`);
    try {
      const r = await processBatch(batches[i], scrapedAt);
      totalCost += r.cost;
      totalWrote += r.wrote;
      console.log(`  [batch] running total: $${totalCost.toFixed(2)} / wrote ${totalWrote}`);
      if (totalCost > TOTAL_BUDGET_USD) {
        console.warn(`\n[scrape-all] TOTAL BUDGET EXCEEDED ($${totalCost.toFixed(2)} > $${TOTAL_BUDGET_USD}). Stopping.`);
        break;
      }
    } catch (e) {
      console.error(`[batch ${i + 1}] FAILED: ${(e as Error).message}`);
      console.error(`  continuing with next batch`);
    }
  }

  console.log(`\n[scrape-all] DONE. wrote=${totalWrote} cost=$${totalCost.toFixed(2)}`);
}

main().catch((e) => { console.error("\n[scrape-all] error:", (e as Error).message); process.exit(1); });
