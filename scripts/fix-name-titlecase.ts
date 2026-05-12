/**
 * Re-runs Step 5 title-casing with the proper structural rule:
 * preserve all-caps 2-4 char tokens (acronyms) instead of using an allowlist.
 *
 * Applied to the same 26 slugs that were updated in cleanup-db.ts.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

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

const SLUGS = [
  "agora-mediterranean-cuisine",
  "all-good-tattoo-company",
  "bao-cmu",
  "blue-sky-kitchen-bar",
  "blume-nails",
  "caribbean-south-asian-bazaar",
  "cloud-nail-bar-lash",
  "fine-wine-good-spirits-cgq7mu",
  "flawless-by-lola-llc",
  "green-pepper",
  "historic-bedford-house-pgh",
  "iron-factory-gym",
  "joe-the-juice",
  "kavsar-restaurant",
  "mediterranean-market",
  "mission-bbq",
  "poke-sushi",
  "proof-sports-bar",
  "results-fitness-gym-strength-and-endurance",
  "rock-n-forever-roll-llc",
  "shabu-shabu-hot-pot-grill",
  "shay-and-baeee-seafood-express-more",
  "soothing-body-spa",
  "storming-crab",
  "studio-39-fitness",
  "sweat-pgh",
];

// Re-derive the title-case from the ORIGINAL all-caps name we saved in the
// backup file. Re-lookup originals from the snapshot.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function latestBackup(): string {
  const dir = "scripts/backups";
  const files = readdirSync(dir).filter((f) => f.startsWith("cleanup-snapshot-"));
  files.sort();
  return path.join(dir, files[files.length - 1]);
}

function titleCaseToken(raw: string, indexInWord: number): string {
  // Preserve all-caps 2-4 char tokens as acronyms (BBQ, USA, LLC, PGH, CMU, BAO).
  // This is the structural rule from the plan: "preserve all-caps acronyms
  // only if they're 2-4 chars".
  if (/^[A-Z]{2,4}$/.test(raw)) return raw;
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function titleCaseWord(raw: string, index: number, total: number): string {
  // Split on internal apostrophes/hyphens, recompose preserving them.
  const parts = raw.split(/([&'\-])/);
  return parts
    .map((p) => {
      if (p === "&" || p === "'" || p === "-") return p;
      if (!p) return p;
      // If it's 2-4 chars all-caps, keep as acronym.
      if (/^[A-Z]{2,4}$/.test(p)) return p;
      const lower = p.toLowerCase();
      // small-word lowercase if not first or last word
      if (
        index !== 0 &&
        index !== total - 1 &&
        SMALL_WORDS.has(lower) &&
        // small-word rule applies only to the entire word, not a sub-token
        parts.length === 1
      ) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function titleCase(name: string): string {
  const words = name.split(/\s+/);
  return words.map((w, i) => titleCaseWord(w, i, words.length)).join(" ");
}

async function main() {
  const backupPath = latestBackup();
  console.log("Reading originals from:", backupPath);
  const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
  const originals = new Map<string, string>();
  for (const row of backup.all_caps_before as Array<{ slug: string; name: string }>) {
    originals.set(row.slug, row.name);
  }

  const updates: Array<{ slug: string; before: string; after: string }> = [];
  for (const slug of SLUGS) {
    const before = originals.get(slug);
    if (!before) {
      console.warn(`  MISSING original for ${slug} in backup; skipping`);
      continue;
    }
    const after = titleCase(before);
    updates.push({ slug, before, after });
  }

  console.log("\nProposed updates:");
  for (const u of updates) console.log(`  ${u.slug}: "${u.before}" -> "${u.after}"`);

  for (const u of updates) {
    await sql`UPDATE businesses SET name = ${u.after}, updated_at = NOW() WHERE slug = ${u.slug}`;
  }
  console.log(`\nApplied ${updates.length} updates.`);

  // Verify
  const after = (await sql`
    SELECT slug, name FROM businesses WHERE slug = ANY(${SLUGS}) ORDER BY slug
  `) as Array<{ slug: string; name: string }>;
  console.log("\nFinal state:");
  for (const r of after) console.log(`  ${r.slug}: ${r.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
