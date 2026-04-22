#!/usr/bin/env tsx
/**
 * Cross-reference Dec 2025 (v1) vs Apr 2026 (v2) Google Maps scrapes to compute
 * per-business growth deltas. Write under the `growth` key in each
 * `content/social/<slug>.json`.
 *
 * For businesses that don't appear in v1 (added later in the dataset, or
 * outside the foodniche vertical in Dec), `growth: null`, the UI falls back
 * to the "tracking from today" state.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = resolve(__dirname, "..");
const BUSINESSES_DIR = join(PROJECT_ROOT, "content", "businesses");
const SOCIAL_DIR = join(PROJECT_ROOT, "content", "social");
const V1 = join(PROJECT_ROOT, "content", "raw", "apify", "pit-dts-foodniche.json");
const V2 = join(PROJECT_ROOT, "content", "raw", "apify", "pit-dts-foodniche-v2.json");

interface RawItem {
  placeId: string;
  title?: string;
  reviewsCount?: number;
  totalScore?: number;
  imagesCount?: number;
  scrapedAt?: string;
}

interface GrowthBlock {
  period_start: string | null; // YYYY-MM-DD
  period_end: string;
  days: number;
  review_count: { start: number; end: number; delta: number; per_month: number };
  rating: { start: number; end: number; delta: number };
  photo_count: { start: number; end: number; delta: number };
}

async function loadMap(path: string): Promise<Map<string, RawItem>> {
  const items = JSON.parse(await readFile(path, "utf8")) as RawItem[];
  const m = new Map<string, RawItem>();
  for (const x of items) if (x.placeId) m.set(x.placeId, x);
  return m;
}

function toDate(x?: string): string | null {
  if (!x) return null;
  return x.slice(0, 10);
}

async function main(): Promise<void> {
  const v1 = await loadMap(V1);
  const v2 = await loadMap(V2);

  const files = (await readdir(BUSINESSES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  let withGrowth = 0;
  let withoutGrowth = 0;

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const biz = JSON.parse(await readFile(join(BUSINESSES_DIR, f), "utf8")) as {
      _meta: { placeId: string };
    };
    const pid = biz._meta.placeId;
    const a = v1.get(pid);
    const b = v2.get(pid);

    const socialPath = join(SOCIAL_DIR, `${slug}.json`);
    const existing = existsSync(socialPath)
      ? JSON.parse(await readFile(socialPath, "utf8"))
      : { slug };

    if (a && b && a.scrapedAt && b.scrapedAt) {
      const days =
        (new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()) /
        (1000 * 60 * 60 * 24);
      const rcStart = a.reviewsCount ?? 0;
      const rcEnd = b.reviewsCount ?? 0;
      const delta = rcEnd - rcStart;
      const perMonth = days > 0 ? delta / (days / 30) : 0;
      const rStart = a.totalScore ?? 0;
      const rEnd = b.totalScore ?? 0;
      const pStart = a.imagesCount ?? 0;
      const pEnd = b.imagesCount ?? 0;

      const growth: GrowthBlock = {
        period_start: toDate(a.scrapedAt)!,
        period_end: toDate(b.scrapedAt)!,
        days: Math.round(days),
        review_count: { start: rcStart, end: rcEnd, delta, per_month: Number(perMonth.toFixed(2)) },
        rating: { start: rStart, end: rEnd, delta: Number((rEnd - rStart).toFixed(2)) },
        photo_count: { start: pStart, end: pEnd, delta: pEnd - pStart },
      };
      existing.growth = growth;
      withGrowth += 1;
    } else {
      existing.growth = null;
      withoutGrowth += 1;
    }

    await writeFile(socialPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
  }

  console.log(
    `[growth] ${withGrowth}/${files.length} businesses cross-referenced v1+v2; ${withoutGrowth} without v1 data.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
