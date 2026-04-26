#!/usr/bin/env tsx
/**
 * snapshot-issue.ts, lock the current state of an issue into a
 * permanent archive so we can re-run the pipeline for the next issue
 * without losing prior data.
 *
 * Why we need this: every scrape and every Claude analysis OVERWRITES
 * the file in place (content/businesses/<slug>.json, content/social/...,
 * content/review-analysis/..., content/lists/articles/...). Without
 * archiving, regenerating Issue 02 would obliterate Issue 01's record.
 *
 * What this snapshots:
 *   - content/businesses/    (per-business artifacts: business + score + meta)
 *   - content/social/        (IG + TikTok mention aggregates)
 *   - content/review-analysis/ (Claude diagnoses, themes, playbooks)
 *   - content/lists/articles/ (generated list articles)
 *
 * What it does NOT snapshot:
 *   - content/raw/           (raw Apify dumps, regenerable, big)
 *   - content/leads/         (subscriber list, time-series by definition)
 *
 * Usage:
 *   npm run snapshot:issue -- spring-2026
 *
 * After snapshotting, the active files stay in place (you can keep
 * editing the live site for the SAME issue); the snapshot is a
 * point-in-time copy. When you ship Issue 02, run again with
 * 'summer-2026' and you'll have both archives side-by-side at
 *   content/issues/spring-2026/...
 *   content/issues/summer-2026/...
 */

import { mkdir, copyFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = process.cwd();
const SOURCES = [
  "content/businesses",
  "content/social",
  "content/review-analysis",
  "content/lists/articles",
];

async function copyDir(srcRel: string, dstRel: string): Promise<number> {
  const src = join(ROOT, srcRel);
  const dst = join(ROOT, dstRel);
  if (!existsSync(src)) {
    console.log(`[snapshot] skip ${srcRel}, not found`);
    return 0;
  }
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src);
  let n = 0;
  for (const e of entries) {
    const srcPath = join(src, e);
    const dstPath = join(dst, e);
    const s = await stat(srcPath);
    if (s.isDirectory()) {
      n += await copyDir(join(srcRel, e), join(dstRel, e));
    } else if (s.isFile()) {
      await copyFile(srcPath, dstPath);
      n++;
    }
  }
  return n;
}

async function main() {
  const issueId = process.argv[2];
  if (!issueId || issueId.startsWith("--")) {
    console.error(
      "Usage: npm run snapshot:issue -- <issue-id>\n  e.g. npm run snapshot:issue -- spring-2026",
    );
    process.exit(1);
  }
  if (!/^[a-z0-9-]+$/.test(issueId)) {
    console.error(
      `[snapshot] issue-id must be url-safe (lowercase, digits, hyphens). got "${issueId}"`,
    );
    process.exit(1);
  }

  const baseRel = `content/issues/${issueId}`;
  const baseAbs = join(ROOT, baseRel);
  if (existsSync(baseAbs)) {
    console.error(
      `[snapshot] ${baseRel} already exists. Refusing to overwrite. Move or delete the existing snapshot first.`,
    );
    process.exit(1);
  }

  console.log(`[snapshot] ${issueId}, copying current state...`);
  let total = 0;
  for (const src of SOURCES) {
    const dst = join(baseRel, src.replace(/^content\//, ""));
    const n = await copyDir(src, dst);
    console.log(`  ${src} -> ${dst} (${n} files)`);
    total += n;
  }

  // Manifest, written last so a partial run is detectable.
  const manifest = {
    issue_id: issueId,
    snapshotted_at: new Date().toISOString(),
    sources: SOURCES,
    total_files: total,
  };
  await writeFile(
    join(baseAbs, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );
  console.log(`[snapshot] done. ${total} files locked at ${baseRel}/`);
  console.log(`           Issue ${issueId} is now permanently archived.`);
}

main().catch((err) => {
  console.error("[snapshot] fatal:", err);
  process.exit(1);
});
