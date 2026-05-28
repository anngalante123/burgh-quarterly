/* eslint-disable no-console */
/**
 * Fix businesses miscategorized as "cafe".
 *
 * Production audit (Spring 2026) found `/leaderboard?category=cafe`
 * returning Schenley Plaza (a public park) and Salem Market & Grill
 * (a market/grill) among results. They are not cafes.
 *
 * Categories available: restaurant, cafe, salon, boutique, fitness,
 * bakery, experience, grocery, bar, brewery, distillery, tattoo,
 * ice_cream, juice, live_music, plant_shop, bookstore, record_store,
 * florist, gallery_museum, spa.
 *
 * Decisions (orchestrator):
 *   schenley-plaza               cafe -> experience
 *     Public park / outdoor plaza, not a coffee operation.
 *   salem-market-grill           cafe -> grocery
 *     Strip District deli/market with a grill counter, not a cafe.
 *   schenley-park-visitor-center cafe -> experience
 *     A park visitor center, not a coffee shop.
 *   outer-limits-adventure-park  cafe -> experience
 *     Adventure park, not a coffee shop.
 *   heislers-market              cafe -> grocery
 *     Neighborhood market, not a cafe.
 *   socotra-grill-cafe           cafe -> restaurant
 *     Yemeni grill / restaurant. Reviews refer to the food, not the
 *     coffee program. Better fit for restaurants leaderboard.
 *
 * Left as `cafe` (confirmed correct on manual review):
 *   anchor-anvil-coffee-bar  - coffee bar
 *   california-coffee-bar    - coffee bar
 *   barista-kats-...         - mobile coffee bar
 *   le-petit-cafe-grille     - cafe with grill, primary identity is cafe
 *   three-little-birds-cafe-juice-bar - cafe + juice bar
 *
 * Usage:
 *   tsx scripts/recategorize-cafes.ts          # dry-run (default)
 *   tsx scripts/recategorize-cafes.ts --commit # write
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const COMMIT = process.argv.includes("--commit");

const FIXES: { slug: string; from: "cafe"; to: string; reason: string }[] = [
  { slug: "schenley-plaza", from: "cafe", to: "experience", reason: "public park / plaza" },
  { slug: "salem-market-grill", from: "cafe", to: "grocery", reason: "market with grill counter" },
  { slug: "schenley-park-visitor-center", from: "cafe", to: "experience", reason: "park visitor center" },
  { slug: "outer-limits-adventure-park", from: "cafe", to: "experience", reason: "adventure park" },
  { slug: "heislers-market", from: "cafe", to: "grocery", reason: "neighborhood market" },
  { slug: "socotra-grill-cafe", from: "cafe", to: "restaurant", reason: "Yemeni grill/restaurant" },
];

async function main() {
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  for (const fix of FIXES) {
    const before = await sql`
      SELECT slug, name, category, neighborhood FROM businesses WHERE slug = ${fix.slug}
    `;
    if (before.length === 0) {
      console.log(`SKIP ${fix.slug}: not found`);
      continue;
    }
    const b = before[0];
    if (b.category !== fix.from) {
      console.log(`SKIP ${fix.slug}: already ${b.category} (expected ${fix.from})`);
      continue;
    }
    console.log(`${fix.slug} (${b.name}, ${b.neighborhood}): ${b.category} -> ${fix.to}   [${fix.reason}]`);
    if (COMMIT) {
      await sql`
        UPDATE businesses SET category = ${fix.to}::category, updated_at = NOW()
        WHERE slug = ${fix.slug}
      `;
    }
  }

  console.log(`\n--- Surfaced for review (NOT auto-changing) ---`);
  console.log(`Cafes with anti-signal words in name. Manual sweep above already`);
  console.log(`covered the obvious ones; remaining have been confirmed correct.\n`);

  const survey = await sql`
    SELECT slug, name FROM businesses
    WHERE category = 'cafe'
      AND (name ILIKE '%plaza%' OR name ILIKE '%park%' OR name ILIKE '%grill%'
        OR name ILIKE '%market%' OR name ILIKE '%stadium%' OR name ILIKE '%diner%')
    ORDER BY name
  `;
  for (const r of survey) {
    const fixed = FIXES.find((f) => f.slug === r.slug);
    console.log(`  ${r.slug} (${r.name})${fixed ? " ← will be fixed" : ""}`);
  }

  if (!COMMIT) console.log(`\nDry run only. Re-run with --commit to apply.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
