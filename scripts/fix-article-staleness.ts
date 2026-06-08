#!/usr/bin/env tsx
/**
 * fix-article-staleness.ts, refresh stale numbers in the static list articles
 * to match the current DB: re-derive every "N reviews" in a stat_line from the
 * live review count, and correct tier-label words in descriptors to the live
 * tier. Dry-run by default; --execute to write.
 *
 * Surgical: only touches review counts in stat_lines and tier words in
 * descriptors. Does not regenerate selections, rankings, or prose.
 */
import path from "node:path";
import fs from "node:fs";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();
import { eq } from "drizzle-orm";

const ISSUE = "2026-spring";
const ARTICLES = path.join(process.cwd(), "content", "lists", "articles");
const TIER_WORD: Record<string, string> = {
  icons: "Icons",
  ones_to_watch: "Ones to Watch",
  neighborhood_staples: "Neighborhood Staple",
};
const ALL_TIER_WORDS = ["Icons tier", "Icons", "Ones to Watch", "Neighborhood Staple"];

async function main() {
  const execute = process.argv.includes("--execute");
  const { db, schema } = await import("@/lib/db/client");
  const sigs = await db.select().from(schema.businessSignals).where(eq(schema.businessSignals.issue_slug, ISSUE));
  const scores = await db.select().from(schema.scores).where(eq(schema.scores.issue_slug, ISSUE));
  const reviewBy = new Map(sigs.map((r: any) => [r.business_slug, r.google_review_count]));
  const tierBy = new Map(scores.map((r: any) => [r.business_slug, r.tier]));

  let changed = 0;
  const log: string[] = [];

  for (const file of fs.readdirSync(ARTICLES).filter((f) => f.endsWith(".json")).sort()) {
    const fp = path.join(ARTICLES, file);
    const art = JSON.parse(fs.readFileSync(fp, "utf8"));
    let dirty = false;
    for (const it of art.items ?? []) {
      const slug = it.business_slug;
      if (!slug) continue;
      // review count in stat_line
      if (typeof it.stat_line === "string") {
        const real = reviewBy.get(slug);
        it.stat_line = it.stat_line.replace(/([\d,]+)\s*reviews/i, (m: string, n: string) => {
          if (real == null) return m;
          const cited = parseInt(n.replace(/,/g, ""), 10);
          if (cited !== real) {
            log.push(`${file} [${it.rank}] ${slug}: reviews ${cited} -> ${real}`);
            changed++;
            dirty = true;
            return `${real.toLocaleString()} reviews`;
          }
          return m;
        });
      }
      // tier word in descriptor (only when the descriptor names a tier that is wrong)
      if (typeof it.descriptor === "string") {
        const realTier = tierBy.get(slug);
        const realWord = realTier ? TIER_WORD[realTier] : null;
        if (realWord) {
          for (const w of ALL_TIER_WORDS) {
            const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
            if (re.test(it.descriptor) && !w.startsWith(realWord)) {
              const replacement = w.endsWith("tier") ? `${realWord} tier` : realWord;
              it.descriptor = it.descriptor.replace(re, replacement);
              log.push(`${file} [${it.rank}] ${slug}: tier word "${w}" -> "${replacement}"`);
              changed++;
              dirty = true;
              break;
            }
          }
        }
      }
    }
    if (dirty && execute) fs.writeFileSync(fp, JSON.stringify(art, null, 2));
  }

  console.log(`[fix] mode=${execute ? "EXECUTE" : "dry-run"}`);
  log.forEach((l) => console.log("  " + l));
  console.log(`[fix] ${changed} change(s) ${execute ? "written" : "would be made"}`);
}

main().then(() => process.exit(0));
