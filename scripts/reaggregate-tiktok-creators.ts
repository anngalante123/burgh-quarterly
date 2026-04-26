#!/usr/bin/env tsx
/**
 * reaggregate-tiktok-creators.ts, enriches each business's TikTok
 * top_creators array with top_video_url, the URL of that creator's
 * highest-played video about this business. Reads the raw scrape
 * dumps in content/raw/tiktok/, applies the same 90-day + relevance
 * filter the scraper does, finds each top creator's best video, and
 * writes back to content/social/<slug>.json.
 *
 * No re-scraping required, no Apify cost.
 *
 * Run after a scrape, or any time the TikTokCreator shape changes.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SOCIAL_DIR = join(process.cwd(), "content", "social");
const RAW_DIR = join(process.cwd(), "content", "raw", "tiktok");
const BUSINESSES_DIR = join(process.cwd(), "content", "businesses");

type RawItem = {
  text?: string;
  webVideoUrl?: string;
  createTimeISO?: string;
  playCount?: number;
  authorMeta?: { name?: string; nickName?: string };
  hashtags?: Array<{ name?: string }>;
};

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

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

async function main() {
  const slugArg = process.argv[2];
  const files = (await readdir(SOCIAL_DIR))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .filter((f) => !slugArg || f === `${slugArg}.json`);

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

    const social = JSON.parse(await readFile(socialPath, "utf-8")) as {
      tiktok_mentions?: { top_creators?: Array<{ handle: string; top_video_url?: string }> };
    };
    const biz = JSON.parse(await readFile(bizPath, "utf-8")) as { name: string };
    const raw = JSON.parse(await readFile(rawPath, "utf-8")) as { items: RawItem[] };

    if (!social.tiktok_mentions || !social.tiktok_mentions.top_creators?.length) {
      skipped++;
      continue;
    }

    const tokens = nameTokens(biz.name);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;

    // Apply same filter as scraper: 90 days + token match somewhere.
    const filtered = raw.items.filter((v) => {
      const posted = v.createTimeISO ? Date.parse(v.createTimeISO) : NaN;
      if (Number.isNaN(posted) || posted < cutoff) return false;
      const haystack = [
        (v.text ?? "").toLowerCase(),
        (v.authorMeta?.name ?? "").toLowerCase(),
        (v.authorMeta?.nickName ?? "").toLowerCase(),
        ...(v.hashtags ?? []).map((h) => (h.name ?? "").toLowerCase()),
      ].join(" ");
      return tokens.some((t) => haystack.includes(t));
    });

    // Index by author for fast top-video lookup.
    const byAuthor = new Map<string, RawItem[]>();
    for (const v of filtered) {
      const a = v.authorMeta?.name;
      if (!a) continue;
      if (!byAuthor.has(a)) byAuthor.set(a, []);
      byAuthor.get(a)!.push(v);
    }

    // For each top_creator, find their highest-played video.
    let setCount = 0;
    for (const c of social.tiktok_mentions.top_creators) {
      const vids = byAuthor.get(c.handle) ?? [];
      if (vids.length === 0) continue;
      const best = vids.slice().sort(
        (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0),
      )[0];
      if (best?.webVideoUrl) {
        c.top_video_url = best.webVideoUrl;
        setCount++;
      }
    }

    await writeFile(socialPath, JSON.stringify(social, null, 2));
    console.log(`[reaggregate] ${slug}, set top_video_url on ${setCount}/${social.tiktok_mentions.top_creators.length} creators`);
    updated++;
  }

  console.log(`\n[reaggregate] done. updated=${updated} skipped=${skipped}`);
}

main().catch((err) => {
  console.error("[reaggregate] fatal:", err);
  process.exit(1);
});
