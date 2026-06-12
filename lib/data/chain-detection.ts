/**
 * Chain detection.
 *
 * Signal Pittsburgh is editorial coverage of independently-owned
 * Pittsburgh businesses. National chains pollute the queue and waste
 * Apify + Claude spend, so we filter them out at scrape time AND again
 * before the per-business pipeline runs.
 *
 * Strategy: case-insensitive substring match against `title` (or any
 * provided alternate name), plus a light secondary signal from Apify's
 * `additionalInfo` block when present. False positives are worse than
 * false negatives: missing a Pittsburgh mini-chain forever is bad,
 * letting one Starbucks slip through is recoverable. When in doubt,
 * leave a name OFF the blocklist.
 *
 * Pittsburgh local mini-chains are EXPLICITLY exempt: Pamela's Diner,
 * Eat'n Park, the Big Burrito family (Mad Mex, Gaucho, Eleven, Casbah,
 * Kaya, Soba), Klavon's, Driftwood Oven, La Gourmandine, etc. Do not
 * add these to the blocklist no matter how chain-like they look.
 */

/* ------------------------------ Blocklist ------------------------------- */

/**
 * National chain substrings, lower-case. Each entry is matched as a
 * substring against the lower-cased candidate name. Order does not
 * matter, but kept loosely grouped for readability.
 *
 * RISK: substring matches are blunt. "Wendy's" matches "Wendy's House
 * of Hand Pies" if such a place exists. Borderline matches should be
 * left out of this list and handled in needs_review.
 */
const NATIONAL_CHAINS: readonly string[] = [
  // Coffee + breakfast
  "starbucks",
  "dunkin'",
  "dunkin donuts",
  "dunkin",
  "tim hortons",
  "krispy kreme",
  "cinnabon",
  "auntie anne's",
  "auntie annes",

  // Burgers + QSR
  "mcdonald's",
  "mcdonalds",
  "raising cane",
  "burger king",
  "wendy's",
  "wendys",
  "five guys",
  "arby's",
  "arbys",
  "chick-fil-a",
  "chick fil a",
  "taco bell",
  "kfc",
  "subway",
  "chipotle",
  "panera bread",
  "panera",

  // Convenience + gas
  "sheetz",
  "getgo",
  "7-eleven",
  "7 eleven",
  "wawa",

  // Pizza + sandwich chains
  "domino's",
  "dominos",
  "pizza hut",
  "papa john's",
  "papa johns",
  "little caesars",
  "jersey mike's",
  "jersey mikes",
  "jimmy john's",
  "jimmy johns",
  "firehouse subs",

  // Sit-down chains
  "applebee's",
  "applebees",
  "olive garden",
  "red robin",
  "buffalo wild wings",
  "chili's",
  "chilis",
  "ihop",
  "denny's",
  "dennys",
  "cracker barrel",
  "texas roadhouse",
  "outback steakhouse",
  "p.f. chang's",
  "pf chang's",
  "p f chang's",
  "the cheesecake factory",
  "cheesecake factory",
  "the melting pot",
  "city works",
  "hard rock cafe",
  "hooters",
  "tgi fridays",
  "tgi friday's",

  // Smoothies + juice
  "smoothie king",
  "jamba juice",

  // Ice cream
  "baskin-robbins",
  "baskin robbins",
  "cold stone",
  "dairy queen",
  "ben & jerry's",
  "ben and jerry's",
  "haagen-dazs",
  "haagen dazs",
  "häagen-dazs",

  // Grocery + big box
  "the fresh market",
  "whole foods",
  "trader joe's",
  "trader joes",
  "aldi",
  "giant eagle",
  "walmart",
  "target",
  "costco",
  "sam's club",
  "sams club",
  "bj's wholesale",
  "bjs wholesale",

  // Drugstores
  "cvs",
  "walgreens",
  "rite aid",

  // Fitness
  "anytime fitness",
  "planet fitness",
  "la fitness",
  "orangetheory",
  "f45",
  "crunch fitness",
  "pure barre",
  "cyclebar",
  "soulcycle",
  "yogaworks",
  "corepower yoga",

  // Salon + wellness chains
  "massage envy",
  "european wax center",
  "hand & stone",
  "hand and stone",
  "drybar",
  "great clips",
  "supercuts",
  "sport clips",

  // Bar / entertainment chains (carryover from scrape-and-queue blocklist).
  "howl at the moon",
  "tom's watch bar",
  "toms watch bar",
  "barcelona wine bar",
  "yard house",
  "miller's ale house",
  "millers ale house",
  "bar louie",
  "world of beer",
  "tilted kilt",
  "topgolf",
  "main event",
  "dave & buster's",
  "dave and busters",
  "dave & busters",
  "twin peaks",
  "ruby tuesday",
  "perkins",

  // Discount retail
  "gabes",
  "gabe's",
  "ross dress for less",

  // Batch 2 audit additions (2026-06-12). The 06-11 audit named Benihana +
  // The Capital Grille; a wider scan (scripts/scan-chains.ts) found these
  // corporate-owned national brands also live in the index. Anna's call:
  // remove corporate-owned restaurants/retail, KEEP locally-operated boutique
  // franchises (Rita's, Bruster's, Club Pilates, StretchLab, Row House
  // Fitness, barre3, Burn Boot Camp, Playa Bowls), so those are NOT added.
  // Substrings kept specific (multi-word) to avoid false positives.
  "benihana",
  "the capital grille",
  "capital grille",
  "eddie v's",
  "eddie vs",
  "bob evans",
  "noodles & company",
  "noodles and company",
  "longhorn steakhouse",
  "red lobster",
  "bonefish grill",
  "morton's the steakhouse",
  "mortons the steakhouse",
  "tropical smoothie",
  "ruth's chris",
  "ruths chris",
  "first watch",
  "bowlero",
  "dollar general",
  "wingstop",
  "wing stop",
  "popeyes",
  "moe's southwest",
  "moes southwest",
  // NOTE: CAVA is removed by row but intentionally NOT blocklisted here:
  // the bare substring "cava" false-positives local names like "Cavacini
  // Landscaping". If CAVA re-ingests, catch it by exact slug, not substring.
];

/**
 * Pittsburgh-local exemptions. These names contain substrings that
 * could trip false positives (e.g. matching a national pattern), so we
 * short-circuit if any of these appear in the candidate name. Kept
 * separate from the blocklist so each side stays auditable.
 */
const LOCAL_EXEMPTIONS: readonly string[] = [
  "pamela's",
  "pamelas",
  "eat'n park",
  "eatn park",
  "mad mex",
  "gaucho parrilla",
  "casbah",
  "kaya",
  "soba",
  "big burrito",
  "klavon's",
  "klavons",
  "driftwood oven",
  "la gourmandine",
];

/* --------------------------------- API ---------------------------------- */

export interface ChainDetectionInput {
  /** Business display name. Apify field `title`. */
  name?: string | null;
  /** Optional alternate name (e.g. parsed from address line). */
  alternateName?: string | null;
  /**
   * Optional Apify `additionalInfo` block. Some chains tag themselves
   * with a "Chain" attribute under "Service options" or similar. Used
   * as a weak secondary signal; never overrides a local exemption.
   */
  additionalInfo?: unknown;
}

/**
 * Return true if the candidate looks like a national chain.
 *
 * Order:
 *   1. If the name matches a local exemption, return false immediately.
 *   2. If any blocklist substring appears in name or alternateName, true.
 *   3. additionalInfo is consulted as a tie-breaker only.
 */
export function isChain(input: ChainDetectionInput | string): boolean {
  const rec: ChainDetectionInput =
    typeof input === "string" ? { name: input } : input;

  const candidates = [rec.name, rec.alternateName]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toLowerCase());
  if (candidates.length === 0) return false;

  // Local exemption short-circuit. A Pittsburgh mini-chain is never a
  // "chain" for our purposes, even if it shares a substring with one.
  for (const cand of candidates) {
    for (const exempt of LOCAL_EXEMPTIONS) {
      if (cand.includes(exempt)) return false;
    }
  }

  for (const cand of candidates) {
    for (const needle of NATIONAL_CHAINS) {
      if (cand.includes(needle)) return true;
    }
  }

  // Weak secondary signal: Apify sometimes records a chain attribute.
  // We only flag if a name candidate is non-empty (we never want to
  // mark unknown-name records as chains).
  if (rec.additionalInfo && typeof rec.additionalInfo === "object") {
    const flat = JSON.stringify(rec.additionalInfo).toLowerCase();
    if (
      flat.includes('"chain":true') ||
      flat.includes('"national chain":true')
    ) {
      return true;
    }
  }

  return false;
}

/** Read-only export so callers can audit the blocklist. */
export const CHAIN_BLOCKLIST: readonly string[] = NATIONAL_CHAINS;
export const CHAIN_LOCAL_EXEMPTIONS: readonly string[] = LOCAL_EXEMPTIONS;
