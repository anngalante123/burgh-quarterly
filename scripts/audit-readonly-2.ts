/* Part 2 of read-only audit: tighter non-PA scan, dup totals, normalization counts. */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const out: Record<string, unknown> = {};

  // Non-PA: addresses ending with a non-PA state code (2 letters + 5 digits ZIP).
  const nonPa = await sql`
    SELECT slug, name, address, neighborhood
    FROM businesses
    WHERE address ~ '\\m(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\\s+\\d{5}'
    ORDER BY address
  `;
  out.non_pa_count = nonPa.length;
  out.non_pa_rows = nonPa;

  // Distinct non-PA states / cities for context
  const nonPaCities = await sql`
    SELECT
      SUBSTRING(address FROM ', ([A-Za-z .]+), ([A-Z]{2})\\s+\\d{5}$') AS city,
      SUBSTRING(address FROM ', ([A-Z]{2})\\s+\\d{5}$') AS state,
      COUNT(*)::int AS n
    FROM businesses
    WHERE address ~ ', [A-Z]{2}\\s+\\d{5}$'
      AND SUBSTRING(address FROM ', ([A-Z]{2})\\s+\\d{5}$') <> 'PA'
    GROUP BY 1,2
    ORDER BY n DESC
  `;
  out.non_pa_breakdown = nonPaCities;

  // Far-from-Pittsburgh PA cities. Pittsburgh metro centers on Allegheny + bordering counties.
  // Far PA cities to flag: Philadelphia/suburbs, Harrisburg, Erie, Scranton, Allentown, Lancaster, Reading, Bethlehem, York, State College, Wilkes-Barre.
  const farPa = await sql`
    SELECT slug, name, address, neighborhood
    FROM businesses
    WHERE address ~* ', (Philadelphia|Harrisburg|Erie|Scranton|Allentown|Lancaster|Reading|Bethlehem|York|State College|Wilkes-Barre|Altoona|Williamsport|Lebanon|Hazleton|New Castle|Sharon|Pottstown|Easton|Stroudsburg|Chambersburg|Hanover|Carlisle|Milford|Woodbury|Newburyport|Fishkill|Hooksett|Foxborough), [A-Z]{2}\\s+\\d{5}'
    ORDER BY address
  `;
  out.far_pa_or_distant_count = farPa.length;
  out.far_pa_or_distant = farPa;

  // ALL-CAPS list (already have total). Show full list.
  const allCaps = await sql`
    SELECT slug, name FROM businesses
    WHERE name = UPPER(name) AND name ~ '[A-Z]{4,}' AND LENGTH(name) > 5
    ORDER BY name
  `;
  out.all_caps_names = allCaps;
  out.all_caps_total = allCaps.length;

  // Names with stray comma without space (e.g., "AF5287-Brentwood,PA")
  const stray = await sql`
    SELECT slug, name FROM businesses
    WHERE name ~ ',[A-Z]' OR name ~ '[a-z]''[a-z]+ county'
    ORDER BY name
  `;
  out.stray_punct_names = stray;

  // Names like "Frenchies" missing apostrophe (heuristic: ends with "ies " followed by lowercase salon/spa words, or contains lowercase ALL-letter chunk inside title)
  const frenchies = await sql`
    SELECT slug, name FROM businesses
    WHERE name ~ '^[A-Z][a-z]+ies\\s' OR name ~ '^[A-Z][a-z]+s\\s[a-z]'
    ORDER BY name LIMIT 40
  `;
  out.missing_apostrophe_candidates = frenchies;

  // Confirm GossipandNailSpa
  const gossip = await sql`SELECT slug, name FROM businesses WHERE name ILIKE '%gossip%' OR name ILIKE '%frenchie%'`;
  out.gossip_and_frenchies = gossip;

  // Total dupe row impact: how many rows are in clusters > 1?
  const dupeTotal = await sql`
    WITH counts AS (
      SELECT LOWER(name) AS lname, COUNT(*)::int AS n FROM businesses GROUP BY LOWER(name)
    )
    SELECT
      (SELECT COUNT(*)::int FROM counts WHERE n > 1) AS cluster_count,
      (SELECT SUM(n)::int FROM counts WHERE n > 1) AS rows_in_clusters,
      (SELECT SUM(n - 1)::int FROM counts WHERE n > 1) AS rows_to_drop
  `;
  out.dupe_totals = dupeTotal[0];

  // How many of the duplicate clusters are CHAINS (multiple legit locations) vs true dupes (same address)?
  // True dupes: clusters where multiple rows share the same address.
  const trueDupes = await sql`
    WITH dup_names AS (
      SELECT LOWER(name) AS lname FROM businesses GROUP BY LOWER(name) HAVING COUNT(*) > 1
    )
    SELECT b.slug, b.name, b.address, b.place_id, b.claimed
    FROM businesses b
    JOIN dup_names d ON LOWER(b.name) = d.lname
    WHERE EXISTS (
      SELECT 1 FROM businesses b2
      WHERE b2.slug <> b.slug
        AND LOWER(b2.name) = LOWER(b.name)
        AND b2.address = b.address
    )
    ORDER BY LOWER(b.name), b.slug
  `;
  out.same_name_same_address_rows = trueDupes;

  // How many rows missing any address?
  const noAddr = await sql`SELECT COUNT(*)::int AS n FROM businesses WHERE address IS NULL OR address = ''`;
  out.missing_address_count = noAddr[0].n;

  // Source breakdown
  const sourceBreakdown = await sql`SELECT source, COUNT(*)::int AS n FROM businesses GROUP BY source`;
  out.source_breakdown = sourceBreakdown;

  // Claimed counts
  const claimedCount = await sql`SELECT claimed, COUNT(*)::int AS n FROM businesses GROUP BY claimed`;
  out.claimed_counts = claimedCount;

  // Score-side: how many businesses have scores?
  const withScores = await sql`SELECT COUNT(DISTINCT business_slug)::int AS n FROM scores`;
  out.businesses_with_scores = withScores[0].n;

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
