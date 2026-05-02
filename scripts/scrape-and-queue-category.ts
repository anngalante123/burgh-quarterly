#!/usr/bin/env tsx
/**
 * Autonomous category scraper for The Burgh Quarterly.
 *
 * Calls the Apify `compass/crawler-google-places` actor via REST, polls until
 * the run finishes, fetches the dataset, filters by stars/reviews/closed/chain
 * blocklist, dedupes by placeId, then writes:
 *   1. Raw payload to `content/raw/apify/pit-{category}-{YYYYMMDD-HHmm}.json`
 *      (audit trail, all items pre-filter).
 *   2. Queue file `content/queues/{category}.json` with a flat `place_ids: string[]`
 *      array. If the queue already exists, the new place_ids are MERGED (dedup).
 *
 * Run via:
 *   node --env-file=.env.local --import tsx ./scripts/scrape-and-queue-category.ts \
 *     --category bar --search "bars Pittsburgh PA, wine bars Pittsburgh PA" \
 *     --min-stars 4.0 --min-reviews 100 --max-reviews-per-place 15 \
 *     --max-places 500 --exclude-chains [--dry-run]
 *
 * Or via tsx directly (loads env from process):
 *   npx tsx scripts/scrape-and-queue-category.ts --category bar --search "..." --dry-run
 *
 * Cost note: Apify Google Maps actor pricing is roughly $9 per 1000 places at
 * the basic tier. Reviews extraction adds ~30% on top. Cost is printed before
 * the actor run starts so you can abort. Use --dry-run to inspect the input
 * JSON without spending anything.
 *
 * Geographic precision: Pittsburgh metro spans 50+ neighborhoods plus
 * Washington / Allegheny / Butler county suburbs. We rely on the caller to
 * include geography in each search string ("bars Pittsburgh PA",
 * "wine bars Washington County PA"). customGeolocation is intentionally NOT
 * used in v1 because the polygon approach is fragile.
 */

import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CategorySchema, type Category } from "../lib/data/schemas";
import { ApifyGoogleMapsRecordSchema } from "../lib/data/normalize";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "compass~crawler-google-places";

const PROJECT_ROOT = resolve(__dirname, "..");
const RAW_DIR = join(PROJECT_ROOT, "content", "raw", "apify");
const QUEUES_DIR = join(PROJECT_ROOT, "content", "queues");

const POLL_INTERVAL_MS = 30_000;
const POLL_SOFT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min, print warning
const POLL_HARD_TIMEOUT_MS = 45 * 60 * 1000; // 45 min, give up

/**
 * Substring blocklist matched against `title.toLowerCase()`. Easy to extend.
 * Covers national chains (food + retail) we don't want polluting Pittsburgh
 * editorial coverage.
 */
const CHAIN_BLOCKLIST: string[] = [
  "buffalo wild wings",
  "bw3",
  "applebees",
  "applebee's",
  "chilis",
  "chili's",
  "outback steakhouse",
  "olive garden",
  "red lobster",
  "tgi fridays",
  "fridays",
  "hooters",
  "twin peaks",
  "hard rock",
  "ruby tuesday",
  "perkins",
  "ihop",
  "denny's",
  "dennys",
  "starbucks",
  "dunkin",
  "panera",
  "chipotle",
  "subway",
  "mcdonald's",
  "mcdonalds",
  "burger king",
  "wendy's",
  "wendys",
  "taco bell",
  "kfc",
  "domino's",
  "dominos",
  "pizza hut",
  // Bar chains added after the first sweep let three through.
  "howl at the moon",
  "tom's watch bar",
  "toms watch bar",
  "barcelona wine bar",
  "yard house",
  "miller's ale house",
  "millers ale house",
  "bar louie",
  "world of beer",
  "tilted kilt",
  "duckpin",
  "topgolf",
  "main event",
  "dave & buster's",
  "dave and busters",
  "dave & busters",
  "papa john's",
  "jersey mike's",
  "five guys",
  "sheetz",
  "gabes",
  "walmart",
  "target",
];

/* ----------------------------- CLI parsing ------------------------------ */

interface CliArgs {
  category: string;
  search: string;
  minStars: number;
  minReviews: number;
  maxReviewsPerPlace: number;
  maxPlaces: number;
  excludeChains: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  const required = (k: string): string => {
    const v = args[k];
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`Missing required flag --${k}`);
    }
    return v;
  };

  const optionalNumber = (k: string, def: number): number => {
    const v = args[k];
    if (v === undefined) return def;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new Error(`Flag --${k} must be a number, got ${String(v)}`);
    }
    return n;
  };

  return {
    category: required("category"),
    search: required("search"),
    minStars: optionalNumber("min-stars", 4.0),
    minReviews: optionalNumber("min-reviews", 100),
    maxReviewsPerPlace: optionalNumber("max-reviews-per-place", 15),
    maxPlaces: optionalNumber("max-places", 500),
    excludeChains: args["exclude-chains"] === true,
    dryRun: args["dry-run"] === true,
  };
}

/* ----------------------------- Apify REST ------------------------------- */

interface ActorRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
    finishedAt?: string;
    stats?: { itemCount?: number };
  };
}

async function apifyRequest<T>(
  url: string,
  init: RequestInit,
  token: string,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify ${init.method ?? "GET"} ${url} failed: ${res.status} ${res.statusText}: ${body.slice(0, 400)}`,
    );
  }
  return (await res.json()) as T;
}

async function startActorRun(
  input: Record<string, unknown>,
  token: string,
): Promise<ActorRunResponse["data"]> {
  const url = `${APIFY_BASE}/acts/${ACTOR_ID}/runs`;
  const res = await apifyRequest<ActorRunResponse>(
    url,
    { method: "POST", body: JSON.stringify(input) },
    token,
  );
  return res.data;
}

async function getRun(
  runId: string,
  token: string,
): Promise<ActorRunResponse["data"]> {
  const url = `${APIFY_BASE}/actor-runs/${runId}`;
  const res = await apifyRequest<ActorRunResponse>(url, { method: "GET" }, token);
  return res.data;
}

async function fetchDatasetItems(
  datasetId: string,
  token: string,
): Promise<unknown[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&format=json`;
  return apifyRequest<unknown[]>(url, { method: "GET" }, token);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pollUntilDone(
  runId: string,
  token: string,
): Promise<ActorRunResponse["data"]> {
  const start = Date.now();
  let warned = false;
  while (true) {
    const run = await getRun(runId, token);
    const elapsedMin = Math.floor((Date.now() - start) / 60_000);
    const itemCount = run.stats?.itemCount ?? 0;
    console.log(
      `[scrape-and-queue] poll t+${elapsedMin}m status=${run.status} items=${itemCount}`,
    );

    if (run.status === "SUCCEEDED") return run;
    if (
      run.status === "FAILED" ||
      run.status === "ABORTED" ||
      run.status === "TIMED-OUT"
    ) {
      throw new Error(
        `Apify run ${runId} ended with status ${run.status}. Check https://console.apify.com/runs/${runId}`,
      );
    }

    const elapsed = Date.now() - start;
    if (elapsed > POLL_HARD_TIMEOUT_MS) {
      throw new Error(
        `Apify run ${runId} still RUNNING after 45min. Check status manually at https://console.apify.com/runs/${runId}.`,
      );
    }
    if (!warned && elapsed > POLL_SOFT_TIMEOUT_MS) {
      console.warn(
        `[scrape-and-queue] WARNING: run ${runId} has been running >30min. Will keep polling another 15min then bail.`,
      );
      warned = true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/* ------------------------------ Filters --------------------------------- */

interface FilterStats {
  stars: number;
  reviews: number;
  closed: number;
  chains: number;
  missing_placeid: number;
  invalid_shape: number;
  duplicates: number;
}

interface FilterResult {
  kept: { placeId: string; title: string }[];
  stats: FilterStats;
}

function isChain(title: string): boolean {
  const t = title.toLowerCase();
  return CHAIN_BLOCKLIST.some((needle) => t.includes(needle));
}

function filterItems(
  items: unknown[],
  args: CliArgs,
): FilterResult {
  const kept: { placeId: string; title: string }[] = [];
  const seen = new Set<string>();
  const stats: FilterStats = {
    stars: 0,
    reviews: 0,
    closed: 0,
    chains: 0,
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
    if (typeof r.totalScore !== "number" || r.totalScore < args.minStars) {
      stats.stars += 1;
      continue;
    }
    if (
      typeof r.reviewsCount !== "number" ||
      r.reviewsCount < args.minReviews
    ) {
      stats.reviews += 1;
      continue;
    }
    if (args.excludeChains && r.title && isChain(r.title)) {
      stats.chains += 1;
      continue;
    }

    seen.add(r.placeId);
    kept.push({ placeId: r.placeId, title: r.title ?? "(unknown)" });
  }

  return { kept, stats };
}

/* ---------------------------- Queue file IO ----------------------------- */

interface QueueFile {
  category: string;
  place_ids: string[];
  notes?: string;
  scraped_at?: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadExistingQueue(
  category: Category,
): Promise<QueueFile | null> {
  const file = join(QUEUES_DIR, `${category}.json`);
  if (!(await fileExists(file))) return null;
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as QueueFile;
  if (!parsed || !Array.isArray(parsed.place_ids)) {
    throw new Error(`Existing queue file ${file} is malformed.`);
  }
  return parsed;
}

interface MergeResult {
  merged: string[];
  existing: number;
  added: number;
  duplicatesAcrossSources: number;
}

function mergePlaceIds(
  existing: string[] | undefined,
  fresh: string[],
): MergeResult {
  const existingSet = new Set(existing ?? []);
  const out = [...(existing ?? [])];
  let added = 0;
  let dups = 0;
  for (const id of fresh) {
    if (existingSet.has(id)) {
      dups += 1;
      continue;
    }
    existingSet.add(id);
    out.push(id);
    added += 1;
  }
  return {
    merged: out,
    existing: existing?.length ?? 0,
    added,
    duplicatesAcrossSources: dups,
  };
}

/* ----------------------------- Formatting ------------------------------- */

function timestampSlug(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function buildActorInput(
  args: CliArgs,
  searches: string[],
): Record<string, unknown> {
  const perSearch = Math.max(
    1,
    Math.ceil(args.maxPlaces / searches.length),
  );
  return {
    searchStringsArray: searches,
    maxCrawledPlacesPerSearch: perSearch,
    maxReviews: args.maxReviewsPerPlace,
    language: "en",
    countryCode: "us",
    // Geography is implied by including "Pittsburgh PA" / "Washington County PA"
    // text in each search string. customGeolocation polygons are too fragile
    // for v1.
  };
}

function estimateCost(
  searches: string[],
  perSearchCap: number,
  maxReviewsPerPlace: number,
): { lo: number; hi: number; placeUpperBound: number } {
  const placeUpperBound = searches.length * perSearchCap;
  // Apify basic tier: ~$9 / 1000 places. Reviews extraction adds roughly 30%.
  const baseLo = (placeUpperBound / 1000) * 9;
  const reviewsSurcharge = maxReviewsPerPlace > 0 ? 0.3 : 0;
  const baseHi = baseLo * (1 + reviewsSurcharge);
  // Real-world hits often run 50-100% of the cap. Show a wider band.
  return {
    lo: baseLo * 0.5,
    hi: baseHi,
    placeUpperBound,
  };
}

/* -------------------------------- Main ---------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Validate category against the project enum.
  const catParsed = CategorySchema.safeParse(args.category);
  if (!catParsed.success) {
    const valid = CategorySchema.options.join(", ");
    console.error(
      `[scrape-and-queue] invalid --category "${args.category}". Valid values: ${valid}`,
    );
    process.exit(1);
  }
  const category: Category = catParsed.data;

  const searches = args.search
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (searches.length === 0) {
    console.error(`[scrape-and-queue] --search produced zero terms after split.`);
    process.exit(1);
  }

  const input = buildActorInput(args, searches);
  const perSearchCap = input.maxCrawledPlacesPerSearch as number;
  const cost = estimateCost(searches, perSearchCap, args.maxReviewsPerPlace);

  console.log(`[scrape-and-queue] category=${category}`);
  console.log(
    `[scrape-and-queue] searches=${searches.length}, cap_per_search=${perSearchCap}, total_cap=${cost.placeUpperBound}`,
  );
  console.log(
    `[scrape-and-queue] estimated apify cost: $${cost.lo.toFixed(2)} - $${cost.hi.toFixed(2)} ` +
      `(${searches.length} searches x ${perSearchCap} places x $9/1000 + reviews surcharge)`,
  );

  if (args.dryRun) {
    console.log(`[scrape-and-queue] DRY RUN. Actor input that WOULD be sent:`);
    console.log(JSON.stringify(input, null, 2));
    console.log(`[scrape-and-queue] dry-run exit, no Apify call made.`);
    return;
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error(
      `[scrape-and-queue] APIFY_TOKEN not set. Run via: node --env-file=.env.local --import tsx ./scripts/scrape-and-queue-category.ts ...`,
    );
    process.exit(1);
  }

  console.log(`[scrape-and-queue] starting actor run ${ACTOR_ID}...`);
  const startedRun = await startActorRun(input, token);
  console.log(
    `[scrape-and-queue] run started: id=${startedRun.id} status=${startedRun.status}`,
  );
  console.log(
    `[scrape-and-queue] live console: https://console.apify.com/runs/${startedRun.id}`,
  );

  const finishedRun = await pollUntilDone(startedRun.id, token);
  console.log(
    `[scrape-and-queue] run finished: status=${finishedRun.status} dataset=${finishedRun.defaultDatasetId}`,
  );

  console.log(`[scrape-and-queue] fetching dataset items...`);
  const items = await fetchDatasetItems(finishedRun.defaultDatasetId, token);
  console.log(`[scrape-and-queue] fetched ${items.length} items`);

  // Write raw audit trail BEFORE filtering.
  await mkdir(RAW_DIR, { recursive: true });
  const stamp = timestampSlug();
  const rawPath = join(RAW_DIR, `pit-${category}-${stamp}.json`);
  await writeFile(rawPath, JSON.stringify(items, null, 2) + "\n", "utf8");

  const { kept, stats } = filterItems(items, args);

  // Merge with existing queue if present.
  await mkdir(QUEUES_DIR, { recursive: true });
  const existing = await loadExistingQueue(category);
  const existingScrapedAt = existing?.scraped_at;
  const newScrapedAt = new Date().toISOString();
  const mostRecentScrapedAt =
    existingScrapedAt && existingScrapedAt > newScrapedAt
      ? existingScrapedAt
      : newScrapedAt;

  const freshIds = kept.map((k) => k.placeId);
  const merge = mergePlaceIds(existing?.place_ids, freshIds);

  const out: QueueFile = {
    category,
    place_ids: merge.merged,
    notes:
      existing?.notes ??
      `Auto-generated by scripts/scrape-and-queue-category.ts. Filters: ${args.minStars}+ stars, ${args.minReviews}+ reviews, exclude_chains=${args.excludeChains}.`,
    scraped_at: mostRecentScrapedAt,
  };
  const queuePath = join(QUEUES_DIR, `${category}.json`);
  await writeFile(queuePath, JSON.stringify(out, null, 2) + "\n", "utf8");

  // Summary.
  console.log(``);
  console.log(`[scrape-and-queue] category=${category}`);
  console.log(
    `[scrape-and-queue] searches=${searches.length}, totalScraped=${items.length}, kept=${kept.length}, ` +
      `filteredOut={ stars: ${stats.stars}, reviews: ${stats.reviews}, closed: ${stats.closed}, ` +
      `chains: ${stats.chains}, missing_placeid: ${stats.missing_placeid}, invalid_shape: ${stats.invalid_shape}, duplicates: ${stats.duplicates} }`,
  );
  console.log(`[scrape-and-queue] written: ${rawPath}`);
  if (existing) {
    console.log(
      `[scrape-and-queue] queue:   ${queuePath} (${out.place_ids.length} place_ids). merged: kept ${merge.existing} existing, added ${merge.added} new, deduped ${merge.duplicatesAcrossSources}`,
    );
  } else {
    console.log(
      `[scrape-and-queue] queue:   ${queuePath} (${out.place_ids.length} place_ids). new file.`,
    );
  }
}

main().catch((err) => {
  console.error(`[scrape-and-queue] fatal:`, err);
  process.exit(1);
});
