#!/usr/bin/env tsx
/**
 * Apify ingestion script — pulls raw Google Maps records from Anna's Apify
 * workspace into `content/raw/apify/<task-name>.json`.
 *
 * Run with: `npm run ingest`
 *
 * Behavior:
 * - Lists every actor-task in the org whose `name` starts with `pit-`.
 * - For each task, fetches the MOST RECENT successful run and its
 *   `defaultDatasetId`.
 * - If the manifest shows the same dataset was already downloaded, we skip —
 *   keeps repeat runs idempotent and cheap.
 * - Otherwise, pages through dataset items (JSON) and writes them to disk.
 * - The manifest (`content/raw/apify/.manifest.json`) is the source of truth
 *   for "what's on disk and how fresh is it."
 *
 * Normalization / scoring is a SEPARATE step — this script only lands raw
 * JSON. See `lib/data/normalize.ts` for the normalizer.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const APIFY_BASE = "https://api.apify.com/v2";
const PAGE_LIMIT = 1000; // max items per page per Apify API

const PROJECT_ROOT = resolve(__dirname, "..");
const OUT_DIR = join(PROJECT_ROOT, "content", "raw", "apify");
const MANIFEST_PATH = join(OUT_DIR, ".manifest.json");

interface ManifestEntry {
  task_name: string;
  task_id: string;
  dataset_id: string;
  run_id: string;
  item_count: number;
  downloaded_at: string; // ISO
}

type Manifest = Record<string, ManifestEntry>; // keyed by task_name

interface ApifyTask {
  id: string;
  name: string; // e.g. "pit-foodhv-n"
  actId: string;
  userId: string;
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  finishedAt?: string;
}

async function loadManifest(): Promise<Manifest> {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Manifest;
  } catch {
    console.warn(`[ingest] manifest unreadable at ${MANIFEST_PATH}, resetting`);
    return {};
  }
}

async function saveManifest(m: Manifest): Promise<void> {
  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n", "utf8");
}

async function apifyGet<T>(path: string, token: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${APIFY_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Apify GET ${url} → ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

async function listPitTasks(
  token: string,
  orgId: string | undefined,
): Promise<ApifyTask[]> {
  const out: ApifyTask[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      desc: "0",
    });
    // If an org id is supplied, scope to it. Apify accepts `userId` as a
    // filter on the tasks endpoint.
    if (orgId) q.set("userId", orgId);
    const res = await apifyGet<{ data: { items: ApifyTask[]; total: number } }>(
      `/actor-tasks?${q.toString()}`,
      token,
    );
    out.push(...res.data.items);
    if (res.data.items.length < limit) break;
    offset += limit;
  }
  return out.filter((t) => t.name.startsWith("pit-"));
}

async function getLastSuccessfulRun(
  taskId: string,
  token: string,
): Promise<ApifyRun | null> {
  try {
    const res = await apifyGet<{ data: ApifyRun }>(
      `/actor-tasks/${taskId}/runs/last?status=SUCCEEDED`,
      token,
    );
    return res.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 404 when a task has never had a successful run — not an error for us
    if (msg.includes("404")) return null;
    throw err;
  }
}

async function fetchDatasetItems(
  datasetId: string,
  token: string,
): Promise<unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  while (true) {
    const q = new URLSearchParams({
      format: "json",
      clean: "1",
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const page = await apifyGet<unknown[]>(
      `/datasets/${datasetId}/items?${q.toString()}`,
      token,
    );
    if (!Array.isArray(page)) break;
    items.push(...page);
    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }
  return items;
}

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  const orgId = process.env.APIFY_ORG_ID;

  if (!token) {
    console.error(
      "[ingest] APIFY_TOKEN not set. Copy .env.example → .env.local and fill it in.",
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const manifest = await loadManifest();

  console.log(`[ingest] listing pit-* tasks from Apify…`);
  const tasks = await listPitTasks(token, orgId);
  console.log(`[ingest] found ${tasks.length} pit-* tasks`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const run = await getLastSuccessfulRun(task.id, token);
      if (!run) {
        console.log(`[ingest] ${task.name}: no successful run yet, skipping`);
        skipped += 1;
        continue;
      }

      const prior = manifest[task.name];
      if (prior && prior.dataset_id === run.defaultDatasetId) {
        console.log(
          `[ingest] ${task.name}: dataset ${run.defaultDatasetId} already ` +
            `downloaded (${prior.item_count} items @ ${prior.downloaded_at}), skipping`,
        );
        skipped += 1;
        continue;
      }

      console.log(
        `[ingest] ${task.name}: fetching dataset ${run.defaultDatasetId}…`,
      );
      const items = await fetchDatasetItems(run.defaultDatasetId, token);

      const outFile = join(OUT_DIR, `${task.name}.json`);
      await writeFile(outFile, JSON.stringify(items, null, 2) + "\n", "utf8");

      manifest[task.name] = {
        task_name: task.name,
        task_id: task.id,
        dataset_id: run.defaultDatasetId,
        run_id: run.id,
        item_count: items.length,
        downloaded_at: new Date().toISOString(),
      };
      await saveManifest(manifest); // save after every task so crashes don't lose progress

      console.log(
        `[ingest] ${task.name}: wrote ${items.length} items → ${outFile}`,
      );
      downloaded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ingest] ${task.name}: FAILED — ${msg}`);
      failed += 1;
    }
  }

  console.log(
    `\n[ingest] done. downloaded=${downloaded} skipped=${skipped} failed=${failed}`,
  );
  if (failed > 0) process.exit(2);
}

main().catch((err) => {
  console.error("[ingest] fatal:", err);
  process.exit(1);
});
