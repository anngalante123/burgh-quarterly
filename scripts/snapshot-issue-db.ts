#!/usr/bin/env tsx
/**
 * snapshot-issue-db.ts, freeze an immutable point-in-time copy of one issue's
 * core database tables to JSON under baselines/<issue>/, so a future quarter
 * can diff against it (compute score/tier/rank movement, roster adds/drops,
 * editorial changes) even if the live rows are later overwritten.
 *
 * Captures (the data that changes quarter to quarter):
 *   - businesses          (roster + identity; whole table)
 *   - business_signals    (rating, reviews, IG inputs; this issue)
 *   - scores              (composite, tier, subscores, ranks; this issue)  <- key for movement
 *   - analyses            (editorial: diagnosis, themes, playbook; this issue)
 *   - issues              (the issue row)
 *
 * Read-only against the DB. Writes JSON files locally. Commit them so the
 * baseline is durable in git.
 *
 * Usage:
 *   npx tsx scripts/snapshot-issue-db.ts                 # 2026-spring
 *   npx tsx scripts/snapshot-issue-db.ts --issue 2026-summer
 */
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();
import { eq } from "drizzle-orm";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=", 2)[1]!;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return fallback;
}

async function main() {
  const issue = arg("issue", "2026-spring");
  const stampIso = arg("stamp", new Date().toISOString());
  const { db, schema } = await import("@/lib/db/client");

  const businesses = await db.select().from(schema.businesses);
  const signals = await db.select().from(schema.businessSignals).where(eq(schema.businessSignals.issue_slug, issue));
  const scores = await db.select().from(schema.scores).where(eq(schema.scores.issue_slug, issue));
  const analyses = await db.select().from(schema.analyses).where(eq(schema.analyses.issue_slug, issue));
  const issueRows = await db.select().from(schema.issues).where(eq(schema.issues.slug, issue));

  const dir = path.join(process.cwd(), "baselines", issue);
  fs.mkdirSync(dir, { recursive: true });
  // gzip the data files (read rarely, only when a future quarter diffs them).
  const write = (name: string, data: unknown) =>
    fs.writeFileSync(
      path.join(dir, `${name}.json.gz`),
      zlib.gzipSync(Buffer.from(JSON.stringify(data, null, 0))),
    );

  write("businesses", businesses);
  write("business_signals", signals);
  write("scores", scores);
  write("analyses", analyses);
  write("issue", issueRows);

  const manifest = {
    issue,
    frozen_at: stampIso,
    note: "Immutable baseline. Do not regenerate. Diff a future issue against scores.json to compute movement.",
    counts: {
      businesses: businesses.length,
      business_signals: signals.length,
      scores: scores.length,
      analyses: analyses.length,
    },
  };
  fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

  console.log(`[snapshot] froze issue '${issue}' to ${dir}`);
  console.log(`[snapshot] counts:`, JSON.stringify(manifest.counts));
}

main().then(() => process.exit(0));
