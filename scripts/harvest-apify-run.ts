#!/usr/bin/env tsx
/**
 * scripts/harvest-apify-run.ts
 *
 * Harvest a finished (or in-flight) Apify Google Maps Scraper run into
 * the per-category queue file. Used when scrape-and-queue-category.ts
 * was killed locally but the Apify run kept going server-side.
 *
 * Usage:
 *   npx tsx scripts/harvest-apify-run.ts \
 *     --run-id <runId> \
 *     --category <category> \
 *     --min-stars 4.0 --min-reviews 50 \
 *     [--wait]
 *
 * --wait polls until the run reaches a terminal status (SUCCEEDED /
 * FAILED / TIMED-OUT / ABORTED) before fetching. Without it the script
 * fetches whatever items exist now (useful for checking progress).
 *
 * Reuses the same chain/geo filters and queue-write semantics as
 * scrape-and-queue-category.ts.
 */
import { join } from "node:path";
import { readFile, writeFile, access } from "node:fs/promises";

import { config as loadEnv } from "dotenv";
loadEnv({ path: join(process.cwd(), ".env.local") });
loadEnv();

import { z } from "zod";
import {
  CategorySchema,
  type Category,
} from "@/lib/data/schemas";
import { isChain as isChainShared } from "@/lib/data/chain-detection";
import { isInPittsburghMetro } from "@/lib/data/geo-filter";

const APIFY_BASE = "https://api.apify.com/v2";
const QUEUES_DIR = join(process.cwd(), "content", "queues");

const ApifyGoogleMapsRecordSchema = z
  .object({
    placeId: z.string().optional(),
    title: z.string().optional(),
    totalScore: z.number().optional(),
    reviewsCount: z.number().optional(),
    permanentlyClosed: z.boolean().optional(),
    temporarilyClosed: z.boolean().optional(),
    address: z.string().nullish(),
    state: z.string().nullish(),
    postalCode: z.string().nullish(),
    additionalInfo: z.unknown().optional(),
  })
  .passthrough();

interface CliArgs {
  runId: string;
  category: Category;
  minStars: number;
  minReviews: number;
  wait: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const runId = get("--run-id");
  const cat = get("--category");
  if (!runId || !cat) {
    console.error("Required: --run-id <id> --category <c>");
    process.exit(1);
  }
  const catParsed = CategorySchema.safeParse(cat);
  if (!catParsed.success) {
    console.error(`Invalid category "${cat}"`);
    process.exit(1);
  }
  return {
    runId,
    category: catParsed.data,
    minStars: Number(get("--min-stars") ?? 4.0),
    minReviews: Number(get("--min-reviews") ?? 50),
    wait: args.includes("--wait"),
  };
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);

async function getRun(runId: string, token: string) {
  const url = `${APIFY_BASE}/actor-runs/${runId}?token=${token}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`run fetch ${r.status}`);
  const j = await r.json();
  return j.data as {
    id: string;
    status: string;
    defaultDatasetId: string;
    finishedAt?: string;
  };
}

async function fetchAllDatasetItems(
  datasetId: string,
  token: string,
): Promise<unknown[]> {
  const out: unknown[] = [];
  const limit = 1000;
  let offset = 0;
  while (true) {
    const url = `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&format=json&limit=${limit}&offset=${offset}&token=${token}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`dataset items fetch ${r.status}`);
    const arr = (await r.json()) as unknown[];
    if (!Array.isArray(arr) || arr.length === 0) break;
    out.push(...arr);
    if (arr.length < limit) break;
    offset += arr.length;
  }
  return out;
}

interface FilterStats {
  stars: number;
  reviews: number;
  closed: number;
  chains: number;
  out_of_geo: number;
  missing_placeid: number;
  invalid_shape: number;
  duplicates: number;
}

function filterItems(items: unknown[], minStars: number, minReviews: number) {
  const kept: { placeId: string; title: string }[] = [];
  const seen = new Set<string>();
  const stats: FilterStats = {
    stars: 0,
    reviews: 0,
    closed: 0,
    chains: 0,
    out_of_geo: 0,
    missing_placeid: 0,
    invalid_shape: 0,
    duplicates: 0,
  };

  for (const raw of items) {
    const parsed = ApifyGoogleMapsRecordSchema.safeParse(raw);
    if (!parsed.success) {
      stats.invalid_shape += 1;
      continue;
    }
    const r = parsed.data;
    if (!r.placeId) {
      stats.missing_placeid += 1;
      continue;
    }
    if (seen.has(r.placeId)) {
      stats.duplicates += 1;
      continue;
    }
    if (r.permanentlyClosed === true || r.temporarilyClosed === true) {
      stats.closed += 1;
      continue;
    }
    if (
      !isInPittsburghMetro({
        postalCode:
          (r as unknown as { postalCode?: string | null }).postalCode ?? null,
        state: r.state ?? null,
        address: r.address ?? null,
      })
    ) {
      stats.out_of_geo += 1;
      continue;
    }
    if (r.title && isChainShared({ name: r.title, additionalInfo: r.additionalInfo })) {
      stats.chains += 1;
      continue;
    }
    if (typeof r.totalScore !== "number" || r.totalScore < minStars) {
      stats.stars += 1;
      continue;
    }
    if (typeof r.reviewsCount !== "number" || r.reviewsCount < minReviews) {
      stats.reviews += 1;
      continue;
    }
    seen.add(r.placeId);
    kept.push({ placeId: r.placeId, title: r.title ?? "(unknown)" });
  }
  return { kept, stats };
}

async function loadQueue(
  category: Category,
): Promise<{ category: string; place_ids: string[] } | null> {
  const file = join(QUEUES_DIR, `${category}.json`);
  try {
    await access(file);
  } catch {
    return null;
  }
  const txt = await readFile(file, "utf8");
  return JSON.parse(txt);
}

async function saveQueue(
  category: Category,
  placeIds: string[],
  notes: string,
): Promise<void> {
  const file = join(QUEUES_DIR, `${category}.json`);
  const body = {
    category,
    place_ids: placeIds,
    notes,
    scraped_at: new Date().toISOString(),
  };
  await writeFile(file, JSON.stringify(body, null, 2) + "\n", "utf8");
}

async function main() {
  const args = parseArgs();
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error("APIFY_TOKEN not set in env (.env.local)");
    process.exit(1);
  }
  console.log(
    `[harvest] run=${args.runId} category=${args.category} wait=${args.wait}`,
  );

  let run = await getRun(args.runId, token);
  console.log(`[harvest] initial status=${run.status}`);

  if (args.wait) {
    while (!TERMINAL.has(run.status)) {
      await new Promise((r) => setTimeout(r, 30_000));
      run = await getRun(args.runId, token);
      console.log(`[harvest] poll status=${run.status}`);
    }
  }

  console.log(
    `[harvest] fetching dataset ${run.defaultDatasetId} (run status=${run.status})`,
  );
  const items = await fetchAllDatasetItems(run.defaultDatasetId, token);
  console.log(`[harvest] dataset items=${items.length}`);

  const { kept, stats } = filterItems(items, args.minStars, args.minReviews);
  console.log(
    `[harvest] filter: kept=${kept.length} | drops:`,
    JSON.stringify(stats),
  );

  const existing = await loadQueue(args.category);
  const merged = new Set<string>(existing?.place_ids ?? []);
  let newAdds = 0;
  for (const k of kept) {
    if (!merged.has(k.placeId)) {
      merged.add(k.placeId);
      newAdds += 1;
    }
  }
  await saveQueue(
    args.category,
    Array.from(merged),
    `Harvested from run ${args.runId} on ${new Date().toISOString()}.`,
  );
  console.log(
    `[harvest] queue ${args.category}.json: pre=${existing?.place_ids.length ?? 0}, kept_new=${newAdds}, total=${merged.size}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
