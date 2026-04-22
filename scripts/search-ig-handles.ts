#!/usr/bin/env tsx
/**
 * For businesses whose handles we couldn't discover from their website, run
 * Apify's instagram-search-scraper to look up likely profiles.
 *
 * Actor: apify/instagram-search-scraper (dtrungtin~instagram-search-scraper)
 * Input:
 *   {
 *     search: "business name Pittsburgh",
 *     searchType: "user",
 *     searchLimit: 5,
 *   }
 *
 * We pick the single best-match by fuzzy-comparing each result's fullName
 * and username against the business name. If no match clears a threshold,
 * leave handle null.
 *
 * Cost: ~$0.05 per search * ~9 searches ≈ $0.45 max.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) {
  console.error("APIFY_TOKEN missing from .env.local");
  process.exit(1);
}

const PROJECT_ROOT = resolve(__dirname, "..");
const HANDLES_PATH = join(PROJECT_ROOT, "content", "social", "handles.json");

const ACTOR_ID = "apify~instagram-search-scraper";

interface HandleRecord {
  slug: string;
  name: string;
  website: string | null;
  instagram_handle: string | null;
  discovery_method: "website_link" | "search_match" | "manual" | "none";
  confidence: "high" | "medium" | "low" | null;
  notes?: string;
}

interface SearchItem {
  username?: string;
  fullName?: string;
  followersCount?: number;
  verified?: boolean;
  biography?: string;
  profileUrl?: string;
  url?: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreMatch(biz: string, cand: SearchItem): number {
  const bizN = normalize(biz);
  const userN = normalize(cand.username ?? "");
  const fullN = normalize(cand.fullName ?? "");
  const bio = (cand.biography ?? "").toLowerCase();

  let score = 0;
  if (userN === bizN) score += 60;
  else if (userN.startsWith(bizN) || bizN.startsWith(userN)) score += 35;
  else if (userN.includes(bizN.slice(0, 6)) || bizN.includes(userN.slice(0, 6))) score += 18;

  if (fullN === bizN) score += 40;
  else if (fullN.startsWith(bizN)) score += 25;
  else if (fullN.includes(bizN.slice(0, 6))) score += 12;

  if (bio.includes("pittsburgh") || bio.includes("pgh")) score += 20;
  if ((cand.followersCount ?? 0) > 250) score += 5;
  if (cand.verified) score += 5;

  return score;
}

async function runSearch(query: string): Promise<SearchItem[]> {
  const runUrl =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const body = {
    search: query,
    searchType: "user",
    searchLimit: 5,
  };
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[search] ${query}: ${res.status} ${text.slice(0, 200)}`);
    return [];
  }
  const data = (await res.json()) as SearchItem[];
  return Array.isArray(data) ? data : [];
}

async function main(): Promise<void> {
  const handles = JSON.parse(await readFile(HANDLES_PATH, "utf8")) as HandleRecord[];
  const missing = handles.filter((h) => !h.instagram_handle);
  console.log(`[search] ${missing.length} businesses missing handles, querying Apify...`);

  for (const h of missing) {
    // The actor rejects punctuation (!?.,:;-+=*&%$#@/~^|<>()[]{}"'`).
    // Strip punctuation and collapse whitespace.
    const cleanName = h.name.replace(/[^A-Za-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const query = `${cleanName} Pittsburgh`;
    try {
      const items = await runSearch(query);
      if (items.length === 0) {
        console.log(`  ${h.slug.padEnd(45)} → no results`);
        continue;
      }
      const scored = items
        .filter((x) => x.username)
        .map((x) => ({ x, score: scoreMatch(h.name, x) }))
        .sort((a, b) => b.score - a.score);

      const top = scored[0];
      if (!top || top.score < 40) {
        console.log(
          `  ${h.slug.padEnd(45)} → top=${top?.x.username ?? "?"} score=${top?.score ?? 0} (below threshold)`,
        );
        continue;
      }
      h.instagram_handle = top.x.username!.toLowerCase();
      h.discovery_method = "search_match";
      h.confidence = top.score >= 80 ? "high" : top.score >= 55 ? "medium" : "low";
      h.notes = `apify search; score=${top.score}; fullName=${top.x.fullName ?? ""}`;
      console.log(`  ${h.slug.padEnd(45)} → @${h.instagram_handle} (${h.confidence}, score=${top.score})`);
    } catch (e) {
      console.warn(`  ${h.slug} err:`, (e as Error).message);
    }
  }

  await writeFile(HANDLES_PATH, JSON.stringify(handles, null, 2) + "\n", "utf8");

  const found = handles.filter((h) => h.instagram_handle).length;
  const byMethod = handles.reduce<Record<string, number>>((acc, r) => {
    acc[r.discovery_method] = (acc[r.discovery_method] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n[search] ${found}/${handles.length} handles resolved. by method: ${JSON.stringify(byMethod)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
