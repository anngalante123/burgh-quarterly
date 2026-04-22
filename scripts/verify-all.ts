#!/usr/bin/env tsx
/**
 * Post-ingest verification, walks content/businesses/*.json and confirms
 * every record validates against the Business + Score schemas.
 *
 * Exit non-zero on any failure. Used by the Pre-Delivery Checklist.
 *
 * Run with: `npx tsx scripts/verify-all.ts`
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BusinessSchema, ScoreSchema } from "../lib/data/schemas";

const PROJECT_ROOT = resolve(__dirname, "..");
const DIR = join(PROJECT_ROOT, "content", "businesses");

async function main(): Promise<void> {
  const files = (await readdir(DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();
  let fails = 0;
  for (const f of files) {
    const raw = JSON.parse(
      await readFile(join(DIR, f), "utf8"),
    ) as Record<string, unknown>;
    // `_meta` is keyed-off for the Business schema check; `_score` feeds Score.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _meta, _score, ...biz } = raw as {
      _meta: unknown;
      _score: unknown;
      [k: string]: unknown;
    };
    const b = BusinessSchema.safeParse(biz);
    if (!b.success) {
      console.error(`[verify] ${f}: Business schema FAIL:`, b.error.message);
      fails += 1;
      continue;
    }
    const s = ScoreSchema.safeParse(_score);
    if (!s.success) {
      console.error(`[verify] ${f}: Score schema FAIL:`, s.error.message);
      fails += 1;
    }
  }
  console.log(`[verify] ${files.length} records checked, ${fails} failed.`);
  if (fails > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[verify] fatal:", err);
  process.exit(1);
});
