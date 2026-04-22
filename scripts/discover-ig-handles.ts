#!/usr/bin/env tsx
/**
 * Discover Instagram handles for all 30 businesses by scraping their websites.
 *
 * Strategy:
 *  1) Fetch the homepage HTML
 *  2) Look for instagram.com profile links (skip /p/, /reel/, /explore/, /tv/)
 *  3) Fall back to "@handle" patterns if no link
 *  4) Write `content/social/handles.json` with confidence metadata
 *
 * No Apify calls here — all free.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..");
const BUSINESSES_DIR = join(PROJECT_ROOT, "content", "businesses");
const SOCIAL_DIR = join(PROJECT_ROOT, "content", "social");

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
]);

function normalizeHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
  if (!h) return null;
  if (SKIP_PATHS.has(h)) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(h)) return null;
  return h;
}

function extractFromHtml(html: string): { handle: string; method: DiscoveryMethod; confidence: Confidence } | null {
  // Prefer ig-profile href links
  IG_PROFILE_RE.lastIndex = 0;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = IG_PROFILE_RE.exec(html)) !== null) {
    const norm = normalizeHandle(m[1]);
    if (norm) candidates.push(norm);
  }
  if (candidates.length > 0) {
    // Most frequent candidate wins
    const freq = new Map<string, number>();
    for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { handle: top, method: "website_link", confidence: "high" };
  }

  // JSON-LD sameAs array check
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
    } catch {
      // ignore malformed JSON-LD
    }
  }

  // The "@handle" fallback is too noisy (matches CSS @keyframes, @media,
  // @font-face, npm-scoped packages like @sentry). Only trust the IG-URL
  // and JSON-LD signals. Rest go to Apify search fallback.
  return null;
}

async function fetchWithTimeout(url: string, ms = 12000): Promise<string | null> {
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

async function discoverOne(biz: {
  slug: string;
  name: string;
  website?: string;
}): Promise<HandleRecord> {
  const base: HandleRecord = {
    slug: biz.slug,
    name: biz.name,
    website: biz.website ?? null,
    instagram_handle: null,
    discovery_method: "none",
    confidence: null,
  };

  if (!biz.website) {
    base.notes = "no website";
    return base;
  }

  // Clean up UTM params / tracking
  let url = biz.website;
  try {
    const u = new URL(url);
    u.search = "";
    url = u.toString();
  } catch {
    // keep as-is
  }

  const html = await fetchWithTimeout(url);
  if (!html) {
    // Try /contact or /about
    const alt = await Promise.all(
      [url.replace(/\/$/, "") + "/contact", url.replace(/\/$/, "") + "/about"].map(
        (u) => fetchWithTimeout(u),
      ),
    );
    const alt2 = alt.find((x) => x !== null);
    if (!alt2) {
      base.notes = "fetch failed";
      return base;
    }
    const result = extractFromHtml(alt2);
    if (result) {
      base.instagram_handle = result.handle;
      base.discovery_method = result.method;
      base.confidence = result.confidence;
    }
    return base;
  }

  const extracted = extractFromHtml(html);
  if (extracted) {
    base.instagram_handle = extracted.handle;
    base.discovery_method = extracted.method;
    base.confidence = extracted.confidence;
    return base;
  }

  // Try a common fallback path
  const footer = await fetchWithTimeout(url.replace(/\/$/, "") + "/contact");
  if (footer) {
    const res2 = extractFromHtml(footer);
    if (res2) {
      base.instagram_handle = res2.handle;
      base.discovery_method = res2.method;
      base.confidence = res2.confidence;
    }
  }
  return base;
}

async function main(): Promise<void> {
  const files = (await readdir(BUSINESSES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const bizList: { slug: string; name: string; website?: string }[] = [];
  for (const f of files) {
    const data = JSON.parse(await readFile(join(BUSINESSES_DIR, f), "utf8")) as {
      slug: string;
      name: string;
      website?: string;
    };
    bizList.push({ slug: data.slug, name: data.name, website: data.website });
  }

  console.log(`[ig-discovery] processing ${bizList.length} businesses...`);

  // Sequential so we don't hammer any one host
  const results: HandleRecord[] = [];
  for (const b of bizList) {
    const r = await discoverOne(b);
    const tag = r.instagram_handle ? `@${r.instagram_handle} (${r.confidence})` : "—";
    console.log(`  ${r.slug.padEnd(45)}  ${tag}`);
    results.push(r);
  }

  // Known manual overrides (fill in handles we can't resolve; keep list tight)
  const MANUAL: Record<string, { handle: string | null; confidence: Confidence; note?: string }> = {
    // override examples go here; none applied by default
  };
  for (const r of results) {
    if (!r.instagram_handle && MANUAL[r.slug]) {
      const m = MANUAL[r.slug];
      r.instagram_handle = m.handle;
      r.discovery_method = m.handle ? "manual" : "none";
      r.confidence = m.confidence;
      if (m.note) r.notes = m.note;
    }
  }

  await writeFile(
    join(SOCIAL_DIR, "handles.json"),
    JSON.stringify(results, null, 2) + "\n",
    "utf8",
  );

  const byMethod = results.reduce<Record<string, number>>((acc, r) => {
    const k = r.discovery_method;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const withHandle = results.filter((r) => r.instagram_handle).length;
  console.log(
    `\n[ig-discovery] ${withHandle}/${results.length} handles found. by method: ${
      JSON.stringify(byMethod)
    }`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
