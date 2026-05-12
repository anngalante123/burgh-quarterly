/**
 * Reverts the 26 rows to the round-1 title-case output (allowlist-based)
 * since the structural rule produced worse results on all-caps input.
 * Then targets just the specific known-bad outputs (Llc, Pgh, Cmu) to upper-case
 * them properly.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Map of slug -> intended final name. These are the round-1 outputs with
// hand-corrected acronym casing where applicable.
const FINAL: Record<string, string> = {
  "agora-mediterranean-cuisine": "Agora Mediterranean Cuisine",
  "all-good-tattoo-company": "All Good Tattoo Company",
  "bao-cmu": "Bao (CMU)",
  "blue-sky-kitchen-bar": "Blue Sky Kitchen & Bar",
  "blume-nails": "Blume Nails",
  "caribbean-south-asian-bazaar": "Caribbean - South Asian Bazaar",
  "cloud-nail-bar-lash": "Cloud Nail Bar & Lash",
  "fine-wine-good-spirits-cgq7mu": "Fine Wine & Good Spirits",
  "flawless-by-lola-llc": "Flawless by Lola, LLC",
  "green-pepper": "Green Pepper",
  "historic-bedford-house-pgh": "Historic Bedford House PGH",
  "iron-factory-gym": "Iron Factory Gym",
  "joe-the-juice": "Joe & the Juice",
  "kavsar-restaurant": "Kavsar Restaurant",
  "mediterranean-market": "Mediterranean Market",
  "mission-bbq": "Mission BBQ",
  "poke-sushi": "Poke Sushi",
  "proof-sports-bar": "Proof Sports Bar",
  "results-fitness-gym-strength-and-endurance":
    "Results Fitness - Gym - Strength - and Endurance",
  "rock-n-forever-roll-llc": "Rock N Forever Roll LLC",
  "shabu-shabu-hot-pot-grill": "Shabu-Shabu Hot Pot & Grill",
  "shay-and-baeee-seafood-express-more": "Shay and Baeee Seafood Express & More",
  "soothing-body-spa": "Soothing Body Spa",
  "storming-crab": "Storming Crab",
  "studio-39-fitness": "Studio 39 Fitness",
  "sweat-pgh": "Sweat PGH",
};

async function main() {
  for (const [slug, name] of Object.entries(FINAL)) {
    await sql`UPDATE businesses SET name = ${name}, updated_at = NOW() WHERE slug = ${slug}`;
  }
  const slugs = Object.keys(FINAL);
  const after = (await sql`
    SELECT slug, name FROM businesses WHERE slug = ANY(${slugs}) ORDER BY slug
  `) as Array<{ slug: string; name: string }>;
  console.log("Final state:");
  for (const r of after) console.log(`  ${r.slug}: ${r.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
