#!/usr/bin/env tsx
/**
 * scripts/dedup-businesses.ts
 *
 * One-time cleanup for the 377 duplicate businesses created by the
 * pre-2026-05-07 resolveSlugForNewBusiness bug, which appended a
 * place_id-derived suffix on EVERY collision instead of detecting
 * "same place_id, same business" and updating in place.
 *
 * For each duplicate group sharing one place_id:
 *   - Pick the "canonical" slug = the one without the trailing 6-char
 *     hash suffix. If both slugs lack the suffix (rare), pick the
 *     shorter; ties broken alphabetically (stable).
 *   - Cascade-delete the duplicate businesses row. FK ON DELETE CASCADE
 *     on business_signals, business_photos, business_reviews,
 *     business_review_keywords, scores, analyses, ingest_runs handles
 *     the children. The canonical retains its own data.
 *
 * Dry-run is default. Pass --commit to write.
 *
 * Side effect Anna accepted: ~30 of 377 dup pairs had MORE photos or
 * reviews on the suffixed (re-scraped) row than the canonical. Those
 * extras are lost. Canonical retains 21+ photos and 11+ reviews per
 * business which is plenty for rendering.
 */
import path from "node:path";

import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv();

type DbModule = typeof import("@/lib/db/client");
let _dbMod: DbModule | null = null;
async function getDb(): Promise<DbModule> {
  if (_dbMod) return _dbMod;
  _dbMod = await import("@/lib/db/client");
  return _dbMod;
}

/** A 6-char lowercase alnum suffix preceded by a hyphen, at end of slug. */
const SUFFIX_RE = /-[a-z0-9]{6}$/;

function pickCanonical(slugs: string[]): { canonical: string; dups: string[] } {
  // First preference: any slug that doesn't end in the SUFFIX_RE pattern.
  const nonSuffixed = slugs.filter((s) => !SUFFIX_RE.test(s));
  if (nonSuffixed.length === 1) {
    return {
      canonical: nonSuffixed[0],
      dups: slugs.filter((s) => s !== nonSuffixed[0]),
    };
  }
  if (nonSuffixed.length > 1) {
    // Pathological: both look canonical. Pick shortest, tie-break alpha.
    const sorted = [...nonSuffixed].sort(
      (a, b) => a.length - b.length || a.localeCompare(b),
    );
    return {
      canonical: sorted[0],
      dups: slugs.filter((s) => s !== sorted[0]),
    };
  }
  // All suffixed (rare). Pick shortest, tie-break alpha.
  const sorted = [...slugs].sort(
    (a, b) => a.length - b.length || a.localeCompare(b),
  );
  return {
    canonical: sorted[0],
    dups: slugs.filter((s) => s !== sorted[0]),
  };
}

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(
    `[dedup-businesses] mode=${commit ? "COMMIT" : "dry-run"}`,
  );

  const { db, schema } = await getDb();
  // Drizzle's group-by-with-array_agg ergonomics are clumsy; use raw SQL
  // via the underlying neon client for the grouping query.
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  const groups = (await sql`
    select place_id,
           count(*) as n,
           array_agg(slug order by slug) as slugs
    from businesses
    where place_id is not null
    group by place_id
    having count(*) > 1
    order by place_id
  `) as Array<{ place_id: string; n: string; slugs: string[] }>;
  console.log(`[scan] ${groups.length} duplicate place_id groups`);

  let canonicalCount = 0;
  const dupsToDelete: string[] = [];
  const pathological: string[][] = [];

  for (const g of groups) {
    const { canonical, dups } = pickCanonical(g.slugs);
    canonicalCount += 1;
    dupsToDelete.push(...dups);
    if (g.slugs.filter((s) => !SUFFIX_RE.test(s)).length > 1) {
      pathological.push(g.slugs);
    }
  }

  console.log(`[plan] canonical rows kept: ${canonicalCount}`);
  console.log(`[plan] duplicate rows to delete: ${dupsToDelete.length}`);
  console.log(
    `[plan] pathological groups (multiple non-suffixed slugs): ${pathological.length}`,
  );
  if (pathological.length > 0) {
    console.log("  first 5 pathological groups:");
    pathological.slice(0, 5).forEach((g) => console.log("   ", g.join(" / ")));
  }
  if (dupsToDelete.length === 0) {
    console.log("[done] nothing to delete");
    return;
  }
  console.log("  first 5 dups to delete:");
  dupsToDelete.slice(0, 5).forEach((s) => console.log("   ", s));

  if (!commit) {
    console.log("\n[done] dry-run, pass --commit to delete");
    return;
  }

  // Delete in batches. The cascade FK takes care of dependent rows in
  // business_signals, business_photos, business_reviews,
  // business_review_keywords, scores, analyses, ingest_runs.
  let deleted = 0;
  const BATCH = 50;
  for (let i = 0; i < dupsToDelete.length; i += BATCH) {
    const chunk = dupsToDelete.slice(i, i + BATCH);
    const result = await sql`
      delete from businesses where slug = ANY(${chunk})
    `;
    deleted += chunk.length;
    if (deleted % 200 === 0 || i + BATCH >= dupsToDelete.length) {
      console.log(`[delete] ${deleted}/${dupsToDelete.length}`);
    }
  }

  // Verify
  const remaining = (await sql`
    select count(*) as n from businesses
  `) as Array<{ n: string }>;
  const remainingDups = (await sql`
    select count(*) as n
    from (
      select place_id from businesses
      where place_id is not null
      group by place_id having count(*) > 1
    ) t
  `) as Array<{ n: string }>;
  console.log(
    `[verify] businesses table: ${remaining[0].n} rows; remaining dup groups: ${remainingDups[0].n}`,
  );
  console.log(`[done] deleted ${deleted} duplicate rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
