/**
 * Batch 2 chain removal (2026-06-12). scripts/scan-chains.ts found 26 national
 * brands live in the index after Batch 1. Anna's call: remove the 18
 * corporate-owned restaurants/retail below, KEEP the 8 locally-operated
 * boutique franchises (Burn Boot Camp, Club Pilates, StretchLab, Row House
 * Fitness, barre3, Rita's, Bruster's, Playa Bowls). Same proven steps as
 * remove-audit-chains.ts: snapshot every affected row, DELETE (children
 * cascade), drop content/social JSONs + handles.json entries, verify.
 *
 * Composite scores are absolute per-business (not peer-relative), so removal
 * does NOT change anyone else's score; only re-ranking is needed afterward
 * (npx tsx scripts/compute-ranks-all.ts).
 *
 * Dry-run by default. Pass --execute to write.
 */
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
const sql = neon(process.env.DATABASE_URL!);
const EXECUTE = process.argv.includes("--execute");

const SLUGS = [
  // 12 corporate-owned sit-down / casual (Icons tier)
  "benihana-pittsburgh",
  "the-capital-grille",
  "eddie-vs-prime-seafood",
  "bob-evans-6vcj4i",
  "noodles-and-company",
  "longhorn-steakhouse-wai4pu",
  "red-lobster-waeg1q",
  "bonefish-grill",
  "mortons-the-steakhouse",
  "tropical-smoothie-cafe-gdkpmo",
  "ruths-chris-steak-house",
  "first-watch-oss18o",
  // 6 corporate QSR / retail / entertainment (Anna named explicitly)
  "bowlero-pittsburgh",
  "dollar-general-6rzn4a",
  "wingstop-gzjumc",
  "popeyes-louisiana-kitchen",
  "moes-southwest-grill-7cbzcy",
  "cava-9z9sr0",
];

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  console.log(EXECUTE ? "EXECUTE mode" : "DRY-RUN (pass --execute to write)");
  console.log(`targeting ${SLUGS.length} slugs\n`);

  // 0) snapshot + confirm each slug resolves to exactly one row
  const found = (await sql`
    select b.slug, b.name, s.composite, s.tier
    from businesses b left join scores s on s.business_slug = b.slug
    where b.slug = any(${SLUGS})
    order by s.composite desc nulls last
  `) as { slug: string; name: string; composite: number | null; tier: string | null }[];
  console.log("resolved rows:");
  for (const r of found) console.log(`  ${String(r.composite ?? "-").padStart(3)} ${(r.tier ?? "-").padEnd(8)} ${r.slug}  (${r.name})`);
  const missing = SLUGS.filter((s) => !found.some((r) => r.slug === s));
  if (missing.length) console.log("\n!! NOT FOUND (check slug):", missing);

  const snapshot: Record<string, unknown> = {};
  for (const table of [
    "businesses",
    "business_signals",
    "business_photos",
    "business_reviews",
    "business_review_keywords",
    "scores",
    "analyses",
  ]) {
    const col = table === "businesses" ? "slug" : "business_slug";
    const rows = await sql.query(`select * from ${table} where ${col} = any($1)`, [SLUGS]);
    snapshot[table] = rows;
    console.log(`snapshot ${table}: ${rows.length} rows`);
  }

  if (!EXECUTE) {
    console.log("\nDry-run complete. No writes.");
    return;
  }

  const backupPath = path.join(process.cwd(), "scripts/backups", `chain-audit-removal-batch2-${ts()}.json`);
  await writeFile(backupPath, JSON.stringify(snapshot, null, 2));
  console.log("\nsnapshot written:", backupPath);

  // 1) delete (children cascade via FK)
  const deleted = await sql`delete from businesses where slug = any(${SLUGS}) returning slug, name`;
  console.log(`deleted ${deleted.length} businesses`);

  // 2) content/social JSONs + handles.json entries
  for (const slug of SLUGS) {
    const f = path.join(process.cwd(), "content/social", `${slug}.json`);
    await unlink(f).catch(() => console.log("  no social JSON for", slug));
  }
  const handlesPath = path.join(process.cwd(), "content/social/handles.json");
  const handles = JSON.parse(await readFile(handlesPath, "utf8")) as { slug: string }[];
  const kept = handles.filter((h) => !SLUGS.includes(h.slug));
  await writeFile(handlesPath, JSON.stringify(kept, null, 2) + "\n");
  console.log(`handles.json: ${handles.length} -> ${kept.length}`);

  // 3) verify
  const remain = await sql`select slug from businesses where slug = any(${SLUGS})`;
  console.log("remaining target rows (want 0):", remain.length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
