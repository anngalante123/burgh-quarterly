/**
 * Remove the five national chains the 2026-06-11 audit found live in the
 * index: Raising Cane's, Ross Dress for Less, The Fresh Market, The Melting
 * Pot, City Works. The blocklist in lib/data/chain-detection.ts now rejects
 * them at ingest; this removes the existing rows.
 *
 * Steps: (0) backup snapshot of every affected row across tables,
 * (1) DELETE FROM businesses (children cascade), (2) remove their
 * content/social JSONs and handles.json entries, (3) verify.
 *
 * Dry-run by default. Pass --execute to write.
 */
import { neon } from "@neondatabase/serverless";
import { writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);
const EXECUTE = process.argv.includes("--execute");

const SLUGS = [
  "city-works-market-square-pittsburgh",
  "raising-canes-chicken-fingers",
  "ross-dress-for-less",
  "the-fresh-market-wzhe30",
  "the-melting-pot-of-pittsburgh",
];

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  console.log(EXECUTE ? "EXECUTE mode" : "DRY-RUN (pass --execute to write)");

  // 0) snapshot
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
    const rows = await sql.query(
      `select * from ${table} where ${col} = any($1)`,
      [SLUGS],
    );
    snapshot[table] = rows;
    console.log(`${table}: ${rows.length} rows`);
  }

  if (!EXECUTE) {
    console.log("\nDry-run complete. No writes.");
    return;
  }

  const backupPath = path.join(
    process.cwd(),
    "scripts/backups",
    `chain-audit-removal-${ts()}.json`,
  );
  await writeFile(backupPath, JSON.stringify(snapshot, null, 2));
  console.log("snapshot written:", backupPath);

  // 1) delete (children cascade via FK)
  const deleted = await sql`
    delete from businesses where slug = any(${SLUGS}) returning slug, name
  `;
  console.log("deleted:", deleted);

  // 2) content/social JSONs + handles.json entries
  for (const slug of SLUGS) {
    const f = path.join(process.cwd(), "content/social", `${slug}.json`);
    await unlink(f).catch(() => console.log("no social JSON for", slug));
  }
  const handlesPath = path.join(process.cwd(), "content/social/handles.json");
  const handles = JSON.parse(await readFile(handlesPath, "utf8")) as {
    slug: string;
  }[];
  const kept = handles.filter((h) => !SLUGS.includes(h.slug));
  await writeFile(handlesPath, JSON.stringify(kept, null, 2) + "\n");
  console.log(`handles.json: ${handles.length} -> ${kept.length}`);

  // 3) verify
  const remain = await sql`select slug from businesses where slug = any(${SLUGS})`;
  console.log("remaining rows (want 0):", remain.length);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
