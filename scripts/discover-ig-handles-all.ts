#!/usr/bin/env tsx
/**
 * Full-index variant of discover-ig-handles.ts.
 * Pulls every business from the Neon DB, merges with the existing
 * content/social/handles.json, then runs website-scrape discovery
 * in parallel for the gap. Apify search fallback is the separate
 * search-ig-handles.ts step.
 *
 * Free. ~10-20 min on 2,000+ sites with concurrency=20.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const PROJECT_ROOT = resolve(__dirname, "..");
const HANDLES_PATH = join(PROJECT_ROOT, "content", "social", "handles.json");

const CONCURRENCY = 20;
const FETCH_TIMEOUT_MS = 10000;
const CHECKPOINT_EVERY = 50;

type DiscoveryMethod = "website_link" | "search_match" | "manual" | "none";
type Confidence = "high" | "medium" | "low" | null;

interface HandleRecord {
  slug: string;
  name: string;
  website: string | null;
  instagram_handle: string | null;
  discovery_method: DiscoveryMethod;
  confidence: Confidence;
  notes?: string;
}

const IG_PROFILE_RE = /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)\/?(?:\?[^"'\s<>]*)?/gi;
const SKIP_PATHS = new Set([
  "p", "reel", "reels", "explore", "tv", "stories", "accounts", "directory",
  "about", "developer", "press", "jobs", "privacy", "terms", "blog", "help",
  "share", "embed",
]);

function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
  if (!h) return null;
  if (SKIP_PATHS.has(h)) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return null;
  return h;
}

function extractFromHtml(html: string): { handle: string; method: DiscoveryMethod; confidence: Confidence } | null {
  IG_PROFILE_RE.lastIndex = 0;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IG_PROFILE_RE.exec(html)) !== null) {
    const norm = normalizeHandle(m[1]);
    if (norm) candidates.push(norm);
  }
  if (candidates.length > 0) {
    const freq = new Map<string, number>();
    for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { handle: top, method: "website_link", confidence: "high" };
  }

  const ldMatch = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ld: RegExpExecArray | null;
  while ((ld = ldMatch.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(ld[1].trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        const sameAs = (node?.sameAs ?? []) as unknown;
        if (Array.isArray(sameAs)) {
          for (const url of sameAs) {
            if (typeof url === "string" && url.includes("instagram.com")) {
              const m2 = /instagram\.com\/([a-zA-Z0-9._]+)/i.exec(url);
              if (m2) {
                const norm = normalizeHandle(m2[1]);
                if (norm) return { handle: norm, method: "website_link", confidence: "high" };
              }
            }
          }
        }
      }
    } catch {}
  }

  return null;
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverOne(biz: { slug: string; name: string; website: string | null }): Promise<HandleRecord> {
  const base: HandleRecord = {
    slug: biz.slug,
    name: biz.name,
    website: biz.website,
    instagram_handle: null,
    discovery_method: "none",
    confidence: null,
  };

  if (!biz.website) {
    base.notes = "no website";
    return base;
  }

  let url = biz.website;
  try {
    const u = new URL(url);
    u.search = "";
    url = u.toString();
  } catch {}

  const html = await fetchWithTimeout(url);
  if (html) {
    const r = extractFromHtml(html);
    if (r) {
      base.instagram_handle = r.handle;
      base.discovery_method = r.method;
      base.confidence = r.confidence;
      return base;
    }
  } else {
    base.notes = "fetch failed";
  }

  // Try /contact as a single fallback (most footers/IG links live there too)
  const alt = await fetchWithTimeout(url.replace(/\/$/, "") + "/contact");
  if (alt) {
    const r2 = extractFromHtml(alt);
    if (r2) {
      base.instagram_handle = r2.handle;
      base.discovery_method = r2.method;
      base.confidence = r2.confidence;
      delete base.notes;
    }
  }
  return base;
}

async function loadExisting(): Promise<Map<string, HandleRecord>> {
  if (!existsSync(HANDLES_PATH)) return new Map();
  const raw = JSON.parse(await readFile(HANDLES_PATH, "utf8")) as HandleRecord[];
  return new Map(raw.map((r) => [r.slug, r]));
}

async function main(): Promise<void> {
  const { db } = await import("../lib/db/client");
  const { businesses } = await import("../lib/db/schema");
  const rows = (await db
    .select({ slug: businesses.slug, name: businesses.name, website: businesses.website })
    .from(businesses)) as Array<{ slug: string; name: string; website: string | null }>;

  console.log(`[discover-all] ${rows.length} businesses in DB`);

  const existing = await loadExisting();
  console.log(`[discover-all] ${existing.size} existing entries in handles.json (${[...existing.values()].filter(r => r.instagram_handle).length} already resolved)`);

  const toProcess: typeof rows = [];
  const merged: HandleRecord[] = [];
  for (const r of rows) {
    const ex = existing.get(r.slug);
    if (ex && ex.instagram_handle) {
      merged.push(ex);
      continue;
    }
    toProcess.push(r);
    merged.push({
      slug: r.slug,
      name: r.name,
      website: r.website,
      instagram_handle: null,
      discovery_method: "none",
      confidence: null,
    });
  }
  console.log(`[discover-all] ${toProcess.length} to process (skipping ${rows.length - toProcess.length} already-resolved)`);

  const indexBySlug = new Map(merged.map((r, i) => [r.slug, i]));

  let processed = 0;
  let found = 0;
  const start = Date.now();

  async function worker(queue: typeof rows) {
    while (queue.length > 0) {
      const biz = queue.shift();
      if (!biz) break;
      const result = await discoverOne(biz);
      const idx = indexBySlug.get(biz.slug)!;
      merged[idx] = result;
      processed++;
      if (result.instagram_handle) found++;
      if (processed % 25 === 0) {
        const rate = processed / ((Date.now() - start) / 1000);
        const eta = Math.round((toProcess.length - processed) / rate);
        console.log(`  [${processed}/${toProcess.length}] found=${found} rate=${rate.toFixed(1)}/s eta=${eta}s`);
      }
      if (processed % CHECKPOINT_EVERY === 0) {
        await writeFile(HANDLES_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
      }
    }
  }

  const queue = [...toProcess];
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));
  await Promise.all(workers);

  await writeFile(HANDLES_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");

  const totalResolved = merged.filter((r) => r.instagram_handle).length;
  const byMethod = merged.reduce<Record<string, number>>((acc, r) => {
    acc[r.discovery_method] = (acc[r.discovery_method] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n[discover-all] done in ${Math.round((Date.now() - start) / 1000)}s`);
  console.log(`[discover-all] ${totalResolved}/${merged.length} handles resolved`);
  console.log(`[discover-all] by method: ${JSON.stringify(byMethod)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
