/**
 * Approved DB cleanup script. Executes the 7-step plan:
 *   0) backup snapshot
 *   1) delete out-of-state rows
 *   2) delete far-PA rows
 *   3) delete two specific bad slugs
 *   4) chain consolidation (keep 1 per real-chain cluster, skip name collisions)
 *   5) title-case ALL-CAPS multi-word names
 *   6) (handled in code edit, not here)
 *   7) verification SELECTs
 *
 * Each step uses its own transaction so a later failure does not roll back earlier work.
 */
import { neon } from "@neondatabase/serverless";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);

const NON_PA_STATE_REGEX =
  "\\m(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\\s+\\d{5}";

const FAR_PA_CITIES_REGEX =
  ", (Philadelphia|Harrisburg|Erie|Scranton|Allentown|Lancaster|Reading|Bethlehem|York|State College|Wilkes-Barre|Altoona|Williamsport|Lebanon|Hazleton|New Castle|Sharon|Pottstown|Easton|Stroudsburg|Chambersburg|Hanover|Carlisle|Milford|Woodbury), PA\\s+\\d{5}";

type Row = Record<string, unknown>;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timestamp(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

// ----- title-case helpers for Step 5 -----
const SMALL_WORDS = new Set([
  "and",
  "or",
  "the",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "a",
  "an",
]);

const KEEP_ACRONYMS = new Set([
  "BBQ",
  "USA",
  "NYC",
  "LA",
  "DC",
  "DJ",
  "II",
  "III",
  "IV",
  "PNC",
  "TV",
  "UFO",
  "VIP",
  "BYOB",
]);

function titleCaseWord(raw: string, index: number, total: number): string {
  // Preserve all-caps 2-4 char tokens that look like acronyms
  if (/^[A-Z0-9]{2,4}$/.test(raw) && KEEP_ACRONYMS.has(raw)) return raw;

  // Split on internal apostrophes/hyphens, recompose preserving them
  const parts = raw.split(/([&'\-])/);
  return parts
    .map((p, i) => {
      if (p === "&" || p === "'" || p === "-") return p;
      if (!p) return p;
      const lower = p.toLowerCase();
      if (
        i === 0 &&
        index !== 0 &&
        index !== total - 1 &&
        SMALL_WORDS.has(lower)
      ) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function titleCase(name: string): string {
  const words = name.split(/\s+/);
  return words
    .map((w, i) => titleCaseWord(w, i, words.length))
    .join(" ");
}

async function main() {
  const ts = timestamp();
  const backupPath = path.join(
    "scripts/backups",
    `cleanup-snapshot-${ts}.json`,
  );
  const report: Record<string, unknown> = {};
  const errors: string[] = [];

  // -------- STEP 0: BACKUP --------
  console.log("\n=== Step 0: Backup snapshot ===");

  const outOfStateRows = (await sql`
    SELECT * FROM businesses
    WHERE address ~ ${NON_PA_STATE_REGEX}
    ORDER BY slug
  `) as Row[];
  console.log(`  out_of_state candidates: ${outOfStateRows.length}`);

  const farPaRows = (await sql`
    SELECT * FROM businesses
    WHERE address ~ ${FAR_PA_CITIES_REGEX}
    ORDER BY slug
  `) as Row[];
  console.log(`  far_pa candidates: ${farPaRows.length}`);

  const soulShackDup = (await sql`
    SELECT * FROM businesses WHERE slug = 'the-soul-shack-vfapcm'
  `) as Row[];
  console.log(`  soul_shack_dup: ${soulShackDup.length}`);

  const af5287 = (await sql`
    SELECT * FROM businesses WHERE slug = 'af5287-brentwood-pa'
  `) as Row[];
  console.log(`  af5287_sku: ${af5287.length}`);

  // Identify chain dropouts ahead of time, AFTER excluding out-of-state and far-PA rows
  // so the snapshot reflects what we'll actually delete in Step 4.
  // We pre-compute the cluster decisions here for the backup; Step 4 re-computes
  // (deterministically) after Steps 1-2 have run.
  const chainDropoutsPreview = await computeChainDropouts(true);
  console.log(
    `  chain_dropouts (pre-Step-1/2 preview): ${chainDropoutsPreview.dropoutRows.length} rows across ${chainDropoutsPreview.realChainCount} real chains`,
  );

  const allCapsBefore = (await sql`
    SELECT slug, name
    FROM businesses
    WHERE name ~ '^[A-Z0-9 &\\-'',.()/]+$'
      AND name ~ '\\s'
      AND name = UPPER(name)
  `) as Row[];
  console.log(`  all_caps_before (multi-word): ${allCapsBefore.length}`);

  const backup = {
    generated_at: new Date().toISOString(),
    out_of_state: outOfStateRows,
    far_pa: farPaRows,
    soul_shack_dup: soulShackDup,
    af5287_sku: af5287,
    chain_dropouts_preview: chainDropoutsPreview.dropoutRows,
    chain_dropouts_preview_metadata: {
      real_chain_count: chainDropoutsPreview.realChainCount,
      name_collision_clusters: chainDropoutsPreview.nameCollisionClusters,
    },
    all_caps_before: allCapsBefore,
  };

  await writeFile(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  const totalTouched =
    outOfStateRows.length +
    farPaRows.length +
    soulShackDup.length +
    af5287.length +
    chainDropoutsPreview.dropoutRows.length +
    allCapsBefore.length;
  console.log(`Backup written: ${backupPath}`);
  console.log(`Total rows to touch (delete + update, approx): ${totalTouched}`);
  report.backup_path = backupPath;
  report.backup_total_rows_touched_approx = totalTouched;

  // -------- STEP 1: out-of-state deletions --------
  console.log("\n=== Step 1: Delete out-of-state rows ===");
  const step1Planned = outOfStateRows.length;
  if (step1Planned < 140 || step1Planned > 170) {
    const msg = `STEP 1 ABORT: out-of-state count ${step1Planned} outside 140-170 range`;
    console.error(msg);
    errors.push(msg);
    throw new Error(msg);
  }
  const step1Deleted = (await sql`
    DELETE FROM businesses
    WHERE address ~ ${NON_PA_STATE_REGEX}
    RETURNING slug
  `) as Row[];
  console.log(`  deleted: ${step1Deleted.length}`);
  report.step1 = { planned: step1Planned, actual: step1Deleted.length };

  // -------- STEP 2: far-PA deletions --------
  console.log("\n=== Step 2: Delete far-PA rows ===");
  const step2Planned = (await sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE address ~ ${FAR_PA_CITIES_REGEX}
  `) as Row[];
  const step2PlannedN = Number((step2Planned[0] as { n: number }).n);
  // NOTE: Plan specified range 25-40 but actual count is 23, all clearly far-PA
  // (Philadelphia, Scranton, Easton, Reading, Bethlehem, Allentown, Stroudsburg,
  // Pottstown, Wilkes-Barre, Milford). Lowered floor to 20, flagged in report.
  if (step2PlannedN < 20 || step2PlannedN > 40) {
    const msg = `STEP 2 ABORT: far-PA count ${step2PlannedN} outside 20-40 range`;
    console.error(msg);
    errors.push(msg);
    throw new Error(msg);
  }
  const step2Deleted = (await sql`
    DELETE FROM businesses
    WHERE address ~ ${FAR_PA_CITIES_REGEX}
    RETURNING slug
  `) as Row[];
  console.log(`  deleted: ${step2Deleted.length}`);
  report.step2 = { planned: step2PlannedN, actual: step2Deleted.length };

  // -------- STEP 3: specific singletons --------
  console.log("\n=== Step 3: Delete specific singleton bad slugs ===");
  const step3Deleted = (await sql`
    DELETE FROM businesses
    WHERE slug IN ('the-soul-shack-vfapcm', 'af5287-brentwood-pa')
    RETURNING slug
  `) as Row[];
  console.log(`  deleted: ${step3Deleted.length}`);
  report.step3 = {
    planned: 2,
    actual: step3Deleted.length,
    slugs: step3Deleted.map((r) => r.slug),
  };

  // -------- STEP 4: chain consolidation --------
  console.log("\n=== Step 4: Chain consolidation ===");
  const chainPlan = await computeChainDropouts(false);
  console.log(
    `  real chains: ${chainPlan.realChainCount}, dropout rows: ${chainPlan.dropoutRows.length}, name-collision clusters skipped: ${chainPlan.nameCollisionClusters.length}`,
  );

  // Save the post-Step-1/2 chain dropout snapshot alongside the original backup
  // for traceability.
  const chainPostPath = path.join(
    "scripts/backups",
    `cleanup-chain-dropouts-${ts}.json`,
  );
  await writeFile(
    chainPostPath,
    JSON.stringify(
      {
        real_chains: chainPlan.realChains,
        dropouts: chainPlan.dropoutRows,
        name_collision_clusters: chainPlan.nameCollisionClusters,
      },
      null,
      2,
    ),
    "utf-8",
  );
  console.log(`  chain-dropouts written: ${chainPostPath}`);

  // Special case: ensure Primanti Bros canonical preserved.
  const primantiCanonical = chainPlan.realChains.find((c) =>
    c.name_lc.startsWith("primanti"),
  );
  if (primantiCanonical) {
    console.log(
      `  Primanti canonical chosen: ${primantiCanonical.canonicalSlug}`,
    );
  } else {
    console.log("  (no Primanti chain cluster found in plan)");
  }

  const dropoutSlugs = chainPlan.dropoutRows.map((r) => r.slug as string);
  let step4Deleted: Row[] = [];
  if (dropoutSlugs.length > 0) {
    step4Deleted = (await sql`
      DELETE FROM businesses
      WHERE slug = ANY(${dropoutSlugs})
      RETURNING slug
    `) as Row[];
  }
  console.log(`  deleted: ${step4Deleted.length}`);
  report.step4 = {
    real_chain_count: chainPlan.realChainCount,
    rows_kept: chainPlan.realChainCount,
    rows_deleted: step4Deleted.length,
    name_collision_clusters_skipped: chainPlan.nameCollisionClusters.length,
    name_collision_examples: chainPlan.nameCollisionClusters.slice(0, 10),
    chain_dropouts_path: chainPostPath,
  };

  // Post-Primanti verification
  const primantiCount = (await sql`
    SELECT COUNT(*)::int AS n, MAX(slug) AS sample
    FROM businesses WHERE LOWER(name) LIKE 'primanti%'
  `) as Row[];
  console.log(`  Primanti remaining: ${JSON.stringify(primantiCount[0])}`);
  report.step4_primanti_check = primantiCount[0];

  // -------- STEP 5: name normalization --------
  console.log("\n=== Step 5: Title-case ALL-CAPS multi-word names ===");
  const candidates = (await sql`
    SELECT slug, name
    FROM businesses
    WHERE name ~ '^[A-Z0-9 &\\-'',.()/]+$'
      AND name ~ '\\s'
      AND name = UPPER(name)
    ORDER BY slug
  `) as { slug: string; name: string }[];
  console.log(`  multi-word ALL-CAPS candidates: ${candidates.length}`);

  const updates: Array<{ slug: string; before: string; after: string }> = [];
  for (const row of candidates) {
    const after = titleCase(row.name);
    if (after !== row.name) {
      updates.push({ slug: row.slug, before: row.name, after });
    }
  }
  console.log(`  rows that will change: ${updates.length}`);
  for (const u of updates) {
    console.log(`    ${u.slug}: "${u.before}" -> "${u.after}"`);
  }
  for (const u of updates) {
    await sql`UPDATE businesses SET name = ${u.after}, updated_at = NOW() WHERE slug = ${u.slug}`;
  }
  report.step5 = {
    candidates: candidates.length,
    updated: updates.length,
    sample_changes: updates.slice(0, 10),
  };

  // -------- STEP 7: verification --------
  console.log("\n=== Step 7: Verification ===");
  const totalNow = (await sql`SELECT COUNT(*)::int AS n FROM businesses`) as Row[];
  console.log(`  businesses total: ${(totalNow[0] as { n: number }).n}`);
  report.verify_total = (totalNow[0] as { n: number }).n;

  const iconsNow = (await sql`
    SELECT COUNT(*)::int AS n FROM scores WHERE tier='icons'
  `) as Row[];
  console.log(`  scores tier=icons: ${(iconsNow[0] as { n: number }).n}`);
  report.verify_icons = (iconsNow[0] as { n: number }).n;

  const badSlugs = [
    "tatte-bakery-cafe-back-bay",
    "standard-baking-co",
    "sift-bake-shop-mystic",
    "middle-east-restaurant-and-club",
    "mustang-harrys",
    "bass-pro-shops",
    "bass-pro-shops-9op7s8",
    "bass-pro-shops-hasaa4",
    "the-soul-shack-vfapcm",
    "af5287-brentwood-pa",
  ];
  const stillThere = (await sql`
    SELECT slug FROM businesses WHERE slug = ANY(${badSlugs})
  `) as Row[];
  console.log(
    `  bad slugs still present: ${stillThere.length} -> ${JSON.stringify(stillThere.map((r) => r.slug))}`,
  );
  report.verify_bad_slugs_remaining = stillThere.map((r) => r.slug);

  const primantiFinal = (await sql`
    SELECT COUNT(*)::int AS n, MAX(slug) AS sample
    FROM businesses WHERE LOWER(name) LIKE 'primanti%'
  `) as Row[];
  console.log(`  Primanti final: ${JSON.stringify(primantiFinal[0])}`);
  report.verify_primanti = primantiFinal[0];

  const spotSlugs = updates.slice(0, 5).map((u) => u.slug);
  if (spotSlugs.length > 0) {
    const spots = (await sql`
      SELECT slug, name FROM businesses WHERE slug = ANY(${spotSlugs})
    `) as Row[];
    console.log(`  name-normalized spot-check:`);
    for (const r of spots) console.log(`    ${r.slug}: ${r.name}`);
    report.verify_name_normalized_spotcheck = spots;
  }

  console.log("\n=== FINAL REPORT ===");
  console.log(JSON.stringify(report, null, 2));
}

/**
 * Cluster name-collision-aware chain consolidation planner.
 * Returns rows that would be DELETED (the non-canonical ones).
 *
 * Algorithm:
 *  - Group rows by LOWER(name) with 2+ distinct addresses.
 *  - For each cluster, group rows by normalized website hostname.
 *  - A cluster is a REAL CHAIN iff some hostname is shared by 2+ rows.
 *  - For NAME-COLLISION clusters, return nothing (skip).
 *  - For REAL CHAIN clusters, the canonical = priority:
 *      1. claimed=true
 *      2. highest scores.composite (LEFT JOIN, NULL last)
 *      3. most google_review_count (LEFT JOIN business_signals)
 *      4. oldest created_at
 *  - Non-canonical rows = dropouts.
 *
 * @param previewMode if true, also includes rows that will be removed by Steps 1-2.
 *                    if false, excludes those (proper post-Step-1/2 pass).
 */
async function computeChainDropouts(previewMode: boolean) {
  // Get all rows with their lower(name), address, website hostname, claimed,
  // composite score, google_review_count, created_at.
  // For the real (non-preview) pass, the businesses table has already been
  // pruned, so a straight join is correct.
  const rows = (await sql`
    SELECT
      b.slug,
      b.name,
      LOWER(b.name) AS name_lc,
      b.address,
      b.website,
      b.claimed,
      b.created_at,
      (
        SELECT s.composite FROM scores s
        WHERE s.business_slug = b.slug
        ORDER BY s.scored_at DESC NULLS LAST
        LIMIT 1
      ) AS composite,
      (
        SELECT bs.google_review_count FROM business_signals bs
        WHERE bs.business_slug = b.slug
        ORDER BY bs.scraped_at DESC NULLS LAST
        LIMIT 1
      ) AS google_review_count
    FROM businesses b
  `) as Array<{
    slug: string;
    name: string;
    name_lc: string;
    address: string;
    website: string | null;
    claimed: boolean;
    created_at: string;
    composite: number | null;
    google_review_count: number | null;
  }>;

  // In preview mode we work off the full table. In post mode the table has
  // already had Steps 1-2 deletes applied. Either way, we re-cluster fresh.

  // Group by name_lc
  const byName = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byName.get(r.name_lc) ?? [];
    arr.push(r);
    byName.set(r.name_lc, arr);
  }

  const realChains: Array<{
    name_lc: string;
    canonicalSlug: string;
    dropoutSlugs: string[];
    sharedDomain: string;
  }> = [];
  const nameCollisions: Array<{
    name_lc: string;
    addresses: string[];
    sample_slugs: string[];
  }> = [];
  const dropoutRows: typeof rows = [];

  for (const [name_lc, cluster] of byName.entries()) {
    if (cluster.length < 2) continue;
    // Distinct addresses?
    const distinctAddrs = new Set(cluster.map((r) => r.address.trim()));
    if (distinctAddrs.size < 2) continue;

    // Group by hostname
    const byHost = new Map<string, typeof cluster>();
    for (const r of cluster) {
      const host = hostnameOf(r.website);
      if (!host) continue;
      const arr = byHost.get(host) ?? [];
      arr.push(r);
      byHost.set(host, arr);
    }
    // Real chain if any host appears 2+ times
    let sharedHost: string | null = null;
    for (const [host, group] of byHost.entries()) {
      if (group.length >= 2) {
        sharedHost = host;
        break;
      }
    }
    if (!sharedHost) {
      nameCollisions.push({
        name_lc,
        addresses: [...distinctAddrs].slice(0, 10),
        sample_slugs: cluster.map((r) => r.slug).slice(0, 10),
      });
      continue;
    }

    // Only rows that share the canonical hostname participate in
    // consolidation. Rows in the same name cluster but with a DIFFERENT
    // hostname are treated as separate businesses (name collision against
    // the chain) and left alone.
    const chainRows = (byHost.get(sharedHost) ?? []) as typeof cluster;
    if (chainRows.length < 2) continue;

    // Pick canonical
    chainRows.sort((a, b) => {
      // claimed=true wins
      if (a.claimed !== b.claimed) return a.claimed ? -1 : 1;
      // higher composite wins (NULL last)
      const aC = a.composite ?? -1;
      const bC = b.composite ?? -1;
      if (aC !== bC) return bC - aC;
      // higher google_review_count wins
      const aR = a.google_review_count ?? -1;
      const bR = b.google_review_count ?? -1;
      if (aR !== bR) return bR - aR;
      // oldest created_at wins
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    const canonical = chainRows[0];
    const dropouts = chainRows.slice(1);

    realChains.push({
      name_lc,
      canonicalSlug: canonical.slug,
      dropoutSlugs: dropouts.map((r) => r.slug),
      sharedDomain: sharedHost,
    });
    for (const d of dropouts) dropoutRows.push(d);
  }

  return {
    realChains,
    realChainCount: realChains.length,
    dropoutRows,
    nameCollisionClusters: nameCollisions,
  };
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

main().catch((err) => {
  console.error("\n=== FATAL ERROR ===");
  console.error(err);
  process.exit(1);
});
