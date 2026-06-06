#!/usr/bin/env tsx
/**
 * rehost-photos-batch.ts
 *
 * Re-fetch fresh Google Maps hero photos for businesses whose stored photo
 * URLs have expired (Google's gps-cs-s URLs are time-limited and 403 after a
 * while), then self-host them on Vercel Blob so they never expire again.
 *
 * Pipeline per business:
 *   1. Apify Google Maps actor re-scrapes by place_id -> fresh imageUrl.
 *   2. uploadPhotoToBlob fetches + resizes + uploads to Vercel Blob.
 *   3. business_photos.url is rewritten to the public Blob URL and blob_key
 *      is set, so the existing render path serves the hosted copy with no
 *      code change.
 *
 * Cost + safety:
 *   - DRY RUN by default. Prints the businesses it would process and makes NO
 *     Apify call (no spend) and NO writes. Pass --execute to actually run.
 *   - --limit N (default 50) bounds the batch. The first real run is a small
 *     test batch to measure true per-photo Apify cost before scaling up.
 *   - Requires APIFY_TOKEN and BLOB_READ_WRITE_TOKEN in the environment.
 *
 * Usage:
 *   npx tsx scripts/rehost-photos-batch.ts                 # dry run, 50
 *   npx tsx scripts/rehost-photos-batch.ts --limit 50 --execute
 *
 * No em dashes in this file. Project rule.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { uploadPhotoToBlob } from "@/lib/scrape/blob-upload";

const ACTOR_ID = "WnMxbsRLNbPeYL6ge"; // lukaskrivka/google-maps-with-contact-details
const APIFY_BASE = "https://api.apify.com/v2";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=", 2)[1]!;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith("--")) {
    return process.argv[idx + 1]!;
  }
  return fallback;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function runApifyForPlaceIds(
  placeIds: string[],
  apifyToken: string,
): Promise<{ datasetId: string; costUsd: number }> {
  // This actor takes Google Maps URLs (startUrls), not raw placeIds. The
  // `?q=place_id:<id>` form makes it resolve the exact place and echo it
  // back as inputPlaceId on the output record.
  const input = {
    startUrls: placeIds.map((pid) => ({
      url: `https://www.google.com/maps/place/?q=place_id:${pid}`,
    })),
    maxImages: 1,
    maxReviews: 0,
    maxQuestions: 0,
    scrapeContacts: false,
    language: "en",
  };
  const startRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apifyToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!startRes.ok) {
    throw new Error(`Apify run start failed ${startRes.status}: ${(await startRes.text()).slice(0, 200)}`);
  }
  const startJson = (await startRes.json()) as { data: { id: string } };
  const runId = startJson.data.id;
  console.log(`[apify] run started: ${runId}; polling...`);

  // Poll until terminal state.
  for (let i = 0; i < 120; i += 1) {
    await sleep(5000);
    const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`);
    const j = (await r.json()) as {
      data: { status: string; defaultDatasetId: string; usageTotalUsd?: number };
    };
    const st = j.data.status;
    if (i % 4 === 0) console.log(`[apify] status=${st} (${(i + 1) * 5}s)`);
    if (st === "SUCCEEDED") {
      return { datasetId: j.data.defaultDatasetId, costUsd: j.data.usageTotalUsd ?? 0 };
    }
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(st)) {
      throw new Error(`Apify run ${runId} ended ${st}`);
    }
  }
  throw new Error(`Apify run ${runId} did not finish within 10 minutes`);
}

async function fetchDatasetItems(datasetId: string, apifyToken: string) {
  const r = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&clean=true&format=json`,
  );
  if (!r.ok) throw new Error(`dataset fetch failed ${r.status}`);
  return (await r.json()) as Array<{
    placeId?: string;
    inputPlaceId?: string;
    imageUrl?: string;
    imageUrls?: string[];
  }>;
}

type Candidate = { slug: string; placeId: string | null };
type DbClient = typeof import("@/lib/db/client");
type Db = DbClient["db"];
type Schema = DbClient["schema"];

async function selectCandidates(
  db: Db,
  schema: Schema,
  limit: number,
): Promise<Candidate[]> {
  return db
    .select({ slug: schema.businesses.slug, placeId: schema.businesses.place_id })
    .from(schema.businesses)
    .innerJoin(
      schema.businessPhotos,
      and(
        eq(schema.businessPhotos.business_slug, schema.businesses.slug),
        eq(schema.businessPhotos.sort_order, 0),
      ),
    )
    .where(and(isNotNull(schema.businesses.place_id), sql`${schema.businessPhotos.blob_key} is null`))
    .limit(limit);
}

async function hostChunk(
  chunk: Candidate[],
  db: Db,
  schema: Schema,
  apifyToken: string,
): Promise<{ hosted: number; noFresh: number; failed: number; cost: number }> {
  const placeIds = chunk.map((r) => r.placeId!).filter(Boolean);
  const { datasetId, costUsd } = await runApifyForPlaceIds(placeIds, apifyToken);
  const items = await fetchDatasetItems(datasetId, apifyToken);

  const freshByPlace = new Map<string, string>();
  for (const it of items) {
    const pid = it.placeId || it.inputPlaceId;
    const url = it.imageUrl || it.imageUrls?.[0];
    if (pid && url) freshByPlace.set(pid, url);
  }

  let hosted = 0;
  let noFresh = 0;
  let failed = 0;
  const CONCURRENCY = 6;
  for (let i = 0; i < chunk.length; i += CONCURRENCY) {
    const slice = chunk.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (r) => {
        const fresh = r.placeId ? freshByPlace.get(r.placeId) : undefined;
        if (!fresh) {
          noFresh += 1;
          return;
        }
        const result = await uploadPhotoToBlob(fresh, r.slug, 0);
        if (!result.blob_key) {
          failed += 1;
          return;
        }
        await db
          .update(schema.businessPhotos)
          .set({ url: result.blob_key, blob_key: result.blob_key })
          .where(
            and(
              eq(schema.businessPhotos.business_slug, r.slug),
              eq(schema.businessPhotos.sort_order, 0),
            ),
          );
        hosted += 1;
      }),
    );
  }
  return { hosted, noFresh, failed, cost: costUsd };
}

async function main() {
  const execute = process.argv.includes("--execute");
  const limit = parseInt(arg("limit", "50"), 10);
  const chunkSize = parseInt(arg("chunk", "250"), 10);
  console.log(`[rehost] mode=${execute ? "EXECUTE (spends Apify $)" : "dry-run"} limit=${limit} chunk=${chunkSize}`);

  const apifyToken = process.env.APIFY_TOKEN;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (execute && (!apifyToken || !blobToken)) {
    console.error(
      `[rehost] --execute needs APIFY_TOKEN (${apifyToken ? "ok" : "MISSING"}) and BLOB_READ_WRITE_TOKEN (${blobToken ? "ok" : "MISSING"})`,
    );
    process.exit(1);
  }

  const { db, schema } = await import("@/lib/db/client");

  if (!execute) {
    const rows = await selectCandidates(db, schema, limit);
    console.log(`[rehost] candidates (place_id present, not yet self-hosted): ${rows.length}`);
    console.log("[rehost] DRY RUN. Would re-scrape + host these (first 10):");
    rows.slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. ${r.slug} (place_id ${r.placeId?.slice(0, 16)}...)`));
    console.log(`[rehost] Pass --execute to run the Apify scrape (~spend).`);
    return;
  }

  // EXECUTE: process in resumable chunks until we hit `limit` businesses or
  // run out of candidates. Each hosted business gets blob_key set, so a
  // re-run naturally resumes where this left off.
  let totalHosted = 0;
  let totalNoFresh = 0;
  let totalFailed = 0;
  let totalCost = 0;
  let processed = 0;
  let chunkNum = 0;
  while (processed < limit) {
    const take = Math.min(chunkSize, limit - processed);
    const chunk = await selectCandidates(db, schema, take);
    if (chunk.length === 0) break;
    chunkNum += 1;
    console.log(`\n[rehost] chunk ${chunkNum}: ${chunk.length} businesses (processed ${processed} so far)`);
    const res = await hostChunk(chunk, db, schema, apifyToken!);
    totalHosted += res.hosted;
    totalNoFresh += res.noFresh;
    totalFailed += res.failed;
    totalCost += res.cost;
    processed += chunk.length;
    console.log(
      `[rehost] chunk ${chunkNum} done: hosted ${res.hosted}, noFresh ${res.noFresh}, failed ${res.failed}, cost $${res.cost.toFixed(4)} | running total hosted ${totalHosted}`,
    );
    // Stop when a whole chunk makes no progress. The remaining candidates
    // have no fresh photo available from Google (noFresh) and would be
    // re-selected forever, so re-scraping them again is pure waste. They
    // keep their placeholder.
    if (res.hosted === 0) {
      console.log(`[rehost] no progress this chunk (${res.noFresh} have no available photo); stopping.`);
      break;
    }
  }

  console.log(`\n[rehost] ALL DONE`);
  console.log(`  hosted: ${totalHosted}`);
  console.log(`  no fresh photo returned: ${totalNoFresh}`);
  console.log(`  upload failed: ${totalFailed}`);
  console.log(`  total Apify cost: $${totalCost.toFixed(2)} over ${processed} businesses`);
}

main().then(() => process.exit(0));
