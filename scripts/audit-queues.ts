#!/usr/bin/env tsx
/**
 * One-off audit: for each untracked queue file (bakery, cafe, fitness),
 * resolve every place_id back to its raw Apify record and evaluate it
 * against `isInPittsburghMetro`. Prints in-scope / out-of-scope counts
 * and a sample of out-of-scope records so we know what would have leaked
 * into the pipeline.
 *
 * Read-only. Does NOT modify any queue or raw file.
 *
 * Usage:
 *   npx tsx scripts/audit-queues.ts
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isInPittsburghMetro } from "../lib/data/geo-filter";

const ROOT = resolve(__dirname, "..");
const QUEUES_DIR = join(ROOT, "content", "queues");
const RAW_DIR = join(ROOT, "content", "raw", "apify");

const CATEGORIES = ["bakery", "cafe", "fitness"] as const;

interface RawRecord {
  placeId?: string;
  title?: string;
  address?: string | null;
  postalCode?: string | null;
  state?: string | null;
}

interface QueueFile {
  category: string;
  place_ids: string[];
}

async function loadRawByPlaceId(category: string): Promise<Map<string, RawRecord>> {
  // Pick the most recent pit-<category>-*.json file in raw/apify/.
  const files = await readdir(RAW_DIR);
  const matches = files
    .filter((f) => f.startsWith(`pit-${category}-`) && f.endsWith(".json"))
    .sort();
  if (matches.length === 0) {
    return new Map();
  }
  const latest = matches[matches.length - 1];
  const raw = await readFile(join(RAW_DIR, latest), "utf8");
  const arr = JSON.parse(raw) as RawRecord[];
  const map = new Map<string, RawRecord>();
  for (const r of arr) {
    if (typeof r.placeId === "string") map.set(r.placeId, r);
  }
  return map;
}

async function loadQueue(category: string): Promise<QueueFile> {
  const file = join(QUEUES_DIR, `${category}.json`);
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as QueueFile;
}

async function auditOne(category: string): Promise<void> {
  const queue = await loadQueue(category);
  const rawByPid = await loadRawByPlaceId(category);

  let inScope = 0;
  let outOfScope = 0;
  let unresolved = 0;
  const samples: { name: string; address: string; reason: string }[] = [];

  for (const pid of queue.place_ids) {
    const rec = rawByPid.get(pid);
    if (!rec) {
      unresolved += 1;
      if (samples.length < 10) {
        samples.push({
          name: "(unresolved place_id)",
          address: pid,
          reason: "no matching record in latest raw file",
        });
      }
      continue;
    }
    const ok = isInPittsburghMetro({
      postalCode: rec.postalCode ?? null,
      state: rec.state ?? null,
      address: rec.address ?? null,
    });
    if (ok) {
      inScope += 1;
    } else {
      outOfScope += 1;
      if (samples.length < 10) {
        samples.push({
          name: rec.title ?? "(unknown)",
          address: rec.address ?? "(no address)",
          reason: `state=${String(rec.state)}, postalCode=${String(rec.postalCode)}`,
        });
      }
    }
  }

  console.log(`\n=== ${category}.json ===`);
  console.log(`  total records:    ${queue.place_ids.length}`);
  console.log(`  in scope:         ${inScope}`);
  console.log(`  out of scope:     ${outOfScope}`);
  console.log(`  unresolved (no raw match): ${unresolved}`);
  if (samples.length > 0) {
    console.log(`  sample (first ${samples.length} not-in-scope or unresolved):`);
    for (const s of samples) {
      console.log(`    - ${s.name}`);
      console.log(`        address: ${s.address}`);
      console.log(`        reason:  ${s.reason}`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`[audit-queues] Pittsburgh-metro geo audit of untracked queues`);
  for (const c of CATEGORIES) {
    try {
      await auditOne(c);
    } catch (e) {
      console.error(`[audit-queues] ${c}: error: ${(e as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(`[audit-queues] fatal:`, err);
  process.exit(1);
});
