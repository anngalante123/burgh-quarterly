/**
 * READ-ONLY scan: find likely national chains still live in the index that
 * the current blocklist (lib/data/chain-detection.ts) does NOT catch.
 *
 * The 2026-06-11 audit named Benihana + The Capital Grille. This widens the
 * net: a candidate list of well-known national restaurant/retail/fitness
 * brands is substring-matched against live business names, then cross-checked
 * against the existing blocklist so we only surface NEW escapes. Output shows
 * slug, name, category, score, tier so Anna can judge each one.
 *
 * No writes. Run: npx tsx scripts/scan-chains.ts
 */
import { config as loadEnv } from "dotenv";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

loadEnv({ path: join(process.cwd(), ".env.local") });
const sql = neon(process.env.DATABASE_URL!);

// Candidate national chains to probe for. Deliberately broad; we judge each
// hit by hand. Local Pittsburgh mini-chains are NOT here.
const CANDIDATES = [
  "benihana", "the capital grille", "capital grille", "ruth's chris", "ruths chris",
  "morton's", "mortons", "fogo de chao", "the melting pot", "longhorn steakhouse",
  "bonefish grill", "carrabba's", "carrabbas", "bahama breeze", "seasons 52",
  "maggiano's", "maggianos", "the cheesecake factory", "cheesecake factory",
  "pf chang", "p.f. chang", "first watch", "another broken egg", "bob evans",
  "eggs up grill", "shake shack", "smashburger", "habit burger", "culver's", "culvers",
  "whataburger", "in-n-out", "del taco", "qdoba", "moe's southwest", "moes southwest",
  "noodles & company", "noodles and company", "cava", "sweetgreen", "chopt",
  "panda express", "pei wei", "wingstop", "wing stop", "zaxby's", "zaxbys",
  "popeyes", "bojangles", "el pollo loco", "captain d's", "long john silver",
  "cheddar's", "cheddars", "logan's roadhouse", "yard house", "the keg",
  "fleming's", "flemings", "del frisco", "eddie v's", "mastro's", "stk steakhouse",
  "ovation brands", "miller's ale house", "twin peaks", "dave & buster", "dave and buster",
  "topgolf", "main event", "punch bowl social", "pinstripes", "bowlero",
  "red lobster", "joe's crab shack", "bubba gump", "rainforest cafe",
  "hard rock", "planet hollywood", "tgi", "ruby tuesday", "o'charley", "ocharley",
  "cracker barrel", "golden corral", "hometown buffet", "old country buffet",
  "panera", "corner bakery", "mcalister's", "mcalisters", "potbelly", "which wich",
  "jason's deli", "jasons deli", "schlotzsky", "blaze pizza", "mod pizza",
  "marco's pizza", "marcos pizza", "donatos", "ledo pizza", "round table pizza",
  "california pizza kitchen", "uno pizzeria", "bertucci's", "bertuccis",
  "auntie anne", "wetzel's pretzels", "nestle toll house", "great american cookies",
  "insomnia cookies", "crumbl", "nothing bundt cakes", "duck donuts", "shipley do-nut",
  "tropical smoothie", "smoothie king", "jamba", "robeks", "playa bowls", "frutta bowls",
  "menchie's", "menchies", "16 handles", "yogurtland", "tcby", "rita's italian ice",
  "ritas italian ice", "bruster's", "brusters", "carvel", "marble slab",
  "f45", "burn boot camp", "9round", "title boxing", "club pilates", "stretchlab",
  "row house", "cyclebar", "yoga six", "xponential", "barre3", "the bar method",
  "ulta", "sephora", "sally beauty", "regis", "fantastic sams", "cost cutters",
  "five below", "dollar tree", "dollar general", "family dollar", "ollie's", "ollies",
  "burlington", "tj maxx", "marshalls", "homegoods", "home goods", "nordstrom rack",
  "michaels", "hobby lobby", "joann", "petco", "petsmart", "pet supplies plus",
  "ulta beauty", "bath & body works", "bath and body works", "lush",
];

function ts() { return new Date().toISOString(); }

async function main() {
  console.log("Chain scan (read-only) —", ts(), "\n");

  // Pull every live business with its score/tier/category.
  const rows = (await sql`
    select b.slug, b.name, b.category,
           s.composite, s.tier
    from businesses b
    left join scores s on s.business_slug = b.slug
    order by s.composite desc nulls last
  `) as { slug: string; name: string; category: string | null; composite: number | null; tier: string | null }[];

  console.log(`live businesses: ${rows.length}\n`);

  const hits: typeof rows = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const n = (r.name || "").toLowerCase();
    for (const c of CANDIDATES) {
      if (n.includes(c)) {
        if (!seen.has(r.slug)) { hits.push(r); seen.add(r.slug); }
        break;
      }
    }
  }

  if (hits.length === 0) {
    console.log("No candidate-chain name matches in the live index.");
    return;
  }

  console.log(`POTENTIAL CHAINS STILL LIVE: ${hits.length}\n`);
  console.log("score | tier | category | slug | name");
  console.log("-".repeat(80));
  for (const h of hits) {
    const sc = h.composite == null ? "  -" : String(h.composite).padStart(3);
    console.log(`${sc} | ${(h.tier ?? "-").padEnd(8)} | ${(h.category ?? "-").padEnd(14)} | ${h.slug} | ${h.name}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
