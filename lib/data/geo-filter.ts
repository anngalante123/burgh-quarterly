/**
 * Geographic filter for Pittsburgh metro ingestion.
 *
 * Half of the existing DB is polluted with non-Pittsburgh businesses
 * because earlier scrapes leaked outside the metro. We are keeping the
 * existing pollution but stopping the bleed: every queued or ingested
 * record must pass `isInPittsburghMetro` first.
 *
 * Scope:
 *   - Allegheny County / Pittsburgh proper:  ZIPs starting with `152`
 *   - Washington / Greene / Fayette counties: ZIPs starting with `153`
 *     (slightly over-broad but acceptable per Anna)
 *   - Allegheny County suburbs in the 151xx range (Oakmont, Allison Park,
 *     Glenshaw, Monroeville, Sewickley, Bethel Park, Carnegie, etc.).
 *     The 151xx prefix as a whole spans several counties (Beaver,
 *     Lawrence, etc.), so we hardcode only the Allegheny County members.
 *   - State must be PA (or `Pennsylvania` spelled out)
 *
 * Anything missing or malformed returns false. We would rather drop
 * an ambiguous record than wrong-ingest one.
 *
 * The filter accepts either an Apify Google Maps record (with
 * `postalCode`, `state`, `address` fields) OR our normalized Business
 * shape (with a single `address` string). When both exist, structured
 * fields take precedence; the raw `address` string is the fallback.
 */

/* ------------------------------ Types ----------------------------------- */

/**
 * The shape this filter actually consumes. Apify records expose
 * `postalCode` and `state` as separate fields; our normalized Business
 * shape only has `address`. We accept both.
 */
export interface GeoFilterInput {
  /** Apify-style separate postal code (e.g. "15217"). */
  postalCode?: string | null;
  /** Apify-style separate state (e.g. "Pennsylvania" or "PA"). */
  state?: string | null;
  /**
   * Combined address string. Used as a fallback when structured fields
   * are absent. Apify's primary `address` typically formats as
   * `"123 Main St, City, ST 12345"`.
   */
  address?: string | null;
}

/* ---------------------------- Constants --------------------------------- */

/**
 * Allegheny County ZIPs that fall in the 151xx range. The 151xx prefix
 * spans several counties (Beaver, Lawrence, Butler, etc.), so a prefix
 * test is too broad. This set enumerates only the Allegheny County
 * members so suburbs like Oakmont (15139), Allison Park (15101),
 * Glenshaw (15116), Monroeville (15146), Sewickley (15143), Bethel Park
 * (15102), and Carnegie (15106) pass the filter while neighbors like
 * Aliquippa (15001, Beaver County) do not.
 */
const ALLEGHENY_151XX_ZIPS: ReadonlySet<string> = new Set([
  "15014", "15015", "15017", "15018", "15024", "15025", "15030", "15032",
  "15044", "15049", "15065", "15071", "15076", "15084", "15086", "15090",
  "15101", "15102", "15104", "15106", "15108", "15110", "15112", "15116",
  "15120", "15122", "15123", "15126", "15129", "15131", "15132", "15133",
  "15134", "15135", "15136", "15137", "15139", "15140", "15142", "15143",
  "15144", "15145", "15146", "15147", "15148",
]);

/* ----------------------------- Helpers ---------------------------------- */

/**
 * Pull a US ZIP and 2-letter state code out of a free-text address.
 * Tolerates ZIP+4 (`15217-1234`), Pennsylvania spelled out, and trailing
 * country tokens (`, USA`).
 *
 * Returns `{ zip: null, state: null }` if either piece can't be located.
 * Test-friendly: exported so unit tests can pin the parser independently
 * of the geo-scope predicate.
 */
export function extractZipState(addressString: string | null | undefined): {
  zip: string | null;
  state: string | null;
} {
  if (typeof addressString !== "string" || addressString.length === 0) {
    return { zip: null, state: null };
  }

  // Find a 5-digit ZIP (optionally followed by -dddd) preceded by some
  // state token. The state can be a 2-letter code (PA) or a spelled-out
  // name. We capture the token just before the ZIP.
  const re = /([A-Za-z][A-Za-z .]{0,30}?)\s+(\d{5})(?:-\d{4})?\b/;
  const m = addressString.match(re);
  if (!m) return { zip: null, state: null };

  const stateRaw = m[1].trim();
  const zip = m[2];

  // Map full state names to 2-letter codes. We only need PA + a couple of
  // neighbors for sanity; anything else falls through unchanged so the
  // predicate can decide.
  const stateLower = stateRaw.toLowerCase();
  let state: string | null = null;
  if (stateLower === "pa" || stateLower === "pennsylvania") {
    state = "PA";
  } else if (/^[A-Z]{2}$/.test(stateRaw)) {
    state = stateRaw;
  } else {
    // Spelled-out non-PA state. Return as-is uppercased for traceability;
    // the predicate will reject it because it isn't `PA`.
    state = stateRaw.toUpperCase();
  }

  return { zip, state };
}

/**
 * Predicate: does this ZIP fall within the Pittsburgh metro window?
 *
 * In scope:
 *   - 152xx (Allegheny County / Pittsburgh proper)
 *   - 153xx (Washington / Greene / Fayette)
 *   - Specific 151xx Allegheny County suburbs (see ALLEGHENY_151XX_ZIPS)
 *
 * Out of scope (notably): other 151xx ZIPs that belong to Beaver,
 * Lawrence, or Butler counties.
 */
function zipInScope(zip: string | null): boolean {
  if (!zip || zip.length < 5) return false;
  const five = zip.slice(0, 5);
  const prefix = five.slice(0, 3);
  if (prefix === "152" || prefix === "153") return true;
  if (prefix === "151") return ALLEGHENY_151XX_ZIPS.has(five);
  return false;
}

/**
 * Normalize a state field to the 2-letter code if we can. Accepts `PA`,
 * `pa`, `Pennsylvania`, `pennsylvania`. Returns null otherwise.
 */
function normalizeState(state: string | null | undefined): string | null {
  if (typeof state !== "string") return null;
  const t = state.trim().toLowerCase();
  if (t === "pa" || t === "pennsylvania") return "PA";
  // Accept any 2-letter uppercase token, e.g. `NY`, so callers can see
  // the explicit non-PA value if they want to log it.
  if (/^[a-z]{2}$/.test(t)) return t.toUpperCase();
  return null;
}

/* ------------------------------- API ------------------------------------ */

/**
 * Return true if this record looks like a Pittsburgh-metro business.
 *
 * Order of evidence:
 *   1. If `postalCode` and `state` are both present, use them directly.
 *   2. Otherwise parse the `address` string for ZIP + state.
 *   3. Anything missing or malformed returns false.
 */
export function isInPittsburghMetro(input: GeoFilterInput): boolean {
  if (!input || typeof input !== "object") return false;

  // Prefer structured fields when both are present.
  const directState = normalizeState(input.state);
  const directZip =
    typeof input.postalCode === "string" && input.postalCode.length > 0
      ? input.postalCode.trim()
      : null;

  if (directState && directZip) {
    if (directState !== "PA") return false;
    return zipInScope(directZip);
  }

  // Fall back to parsing the combined address string.
  const { zip, state } = extractZipState(input.address);
  const normState = normalizeState(state);
  if (normState !== "PA") return false;
  return zipInScope(zip);
}
