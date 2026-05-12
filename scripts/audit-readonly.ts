/* Read-only audit. SELECTs only — no writes. */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const out: Record<string, unknown> = {};

  // 1. row count
  const count = await sql`SELECT COUNT(*)::int AS n FROM businesses`;
  out.business_count = count[0].n;

  // 2. tier counts from scores
  const tierCounts = await sql`
    SELECT tier, COUNT(*)::int AS n FROM scores GROUP BY tier ORDER BY n DESC
  `;
  out.tier_counts = tierCounts;

  // 3. distinct issues
  const issues = await sql`SELECT slug FROM issues ORDER BY slug`;
  out.issues = issues;

  // 4. specific bad slugs
  const badSlugs = await sql`
    SELECT slug, name, address, neighborhood, place_id
    FROM businesses
    WHERE slug ILIKE '%tatte%' OR slug ILIKE '%standard-baking%' OR slug ILIKE '%sift-bake%'
       OR slug ILIKE '%middle-east-restaurant%' OR slug ILIKE '%mustang-harry%'
       OR slug ILIKE '%bass-pro%'
    ORDER BY slug
  `;
  out.named_bad_slugs = badSlugs;

  // 5. non-PA / non-Pittsburgh state extraction
  // Pull state from end of address string (e.g., "..., Pittsburgh, PA 15201")
  const addrSample = await sql`
    SELECT address FROM businesses LIMIT 5
  `;
  out.address_sample = addrSample;

  // 6. addresses NOT containing PA
  const nonPa = await sql`
    SELECT slug, name, address, neighborhood
    FROM businesses
    WHERE address !~* '\\bPA\\b' AND address !~* 'Pennsylvania'
    ORDER BY slug
  `;
  out.non_pa_count = nonPa.length;
  out.non_pa_rows = nonPa.slice(0, 60);

  // 7. PA but not Pittsburgh metro (look for non-metro PA cities)
  const paFar = await sql`
    SELECT slug, name, address, neighborhood
    FROM businesses
    WHERE (address ~* '\\bPA\\b' OR address ~* 'Pennsylvania')
      AND (address ~* 'Philadelphia' OR address ~* 'Harrisburg' OR address ~* 'Erie, PA'
        OR address ~* 'Scranton' OR address ~* 'Allentown' OR address ~* 'Lancaster, PA'
        OR address ~* 'Reading, PA' OR address ~* 'Bethlehem, PA' OR address ~* 'York, PA'
        OR address ~* 'Altoona' OR address ~* 'State College')
    ORDER BY slug
    LIMIT 40
  `;
  out.pa_far_count = paFar.length;
  out.pa_far_rows = paFar;

  // 8. duplicates by exact lowercased name
  const dupesByName = await sql`
    SELECT LOWER(name) AS lname, COUNT(*)::int AS n,
           ARRAY_AGG(slug ORDER BY slug) AS slugs
    FROM businesses
    GROUP BY LOWER(name)
    HAVING COUNT(*) > 1
    ORDER BY n DESC, lname
  `;
  out.dupe_clusters_by_name = dupesByName;

  // 9. duplicates by place_id
  const dupesByPid = await sql`
    SELECT place_id, COUNT(*)::int AS n, ARRAY_AGG(slug ORDER BY slug) AS slugs,
           ARRAY_AGG(name ORDER BY slug) AS names
    FROM businesses
    WHERE place_id IS NOT NULL AND place_id <> ''
    GROUP BY place_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `;
  out.dupe_clusters_by_place_id = dupesByPid;

  // 10. Red Lobster, Primanti detail
  const redLobster = await sql`
    SELECT slug, name, address, neighborhood, place_id, claimed
    FROM businesses WHERE name ILIKE '%red lobster%' OR slug ILIKE '%red-lobster%'
  `;
  out.red_lobster_rows = redLobster;

  const primanti = await sql`
    SELECT slug, name, address, neighborhood, place_id, claimed
    FROM businesses WHERE name ILIKE '%primanti%' OR slug ILIKE '%primanti%'
  `;
  out.primanti_rows = primanti;

  // 11. Name normalization audit
  const allCaps = await sql`
    SELECT slug, name FROM businesses
    WHERE name = UPPER(name) AND name ~ '[A-Z]{4,}' AND LENGTH(name) > 5
    ORDER BY name LIMIT 50
  `;
  out.all_caps_names_count_sample = allCaps;

  const allCapsTotal = await sql`
    SELECT COUNT(*)::int AS n FROM businesses
    WHERE name = UPPER(name) AND name ~ '[A-Z]{4,}' AND LENGTH(name) > 5
  `;
  out.all_caps_total = allCapsTotal[0].n;

  const noSpace = await sql`
    SELECT slug, name FROM businesses
    WHERE name !~ ' ' AND LENGTH(name) > 12
    ORDER BY name LIMIT 30
  `;
  out.no_space_long_names = noSpace;

  // SKU-like prefixes (alphanumeric code + dash) or numeric prefix
  const skuLike = await sql`
    SELECT slug, name FROM businesses
    WHERE name ~ '^[A-Z0-9]{3,8}-' OR name ~ '^[0-9]+\\s'
    ORDER BY name LIMIT 30
  `;
  out.sku_like_names = skuLike;

  // lowercase names (probably wrong)
  const allLower = await sql`
    SELECT slug, name FROM businesses
    WHERE name = LOWER(name) AND LENGTH(name) > 5
    ORDER BY name LIMIT 30
  `;
  out.all_lower_names = allLower;

  // stray apostrophes / odd punctuation
  const oddPunct = await sql`
    SELECT slug, name FROM businesses
    WHERE name ~ '[a-z]''[A-Z]' OR name ~ ',[a-z]' OR name ~ ',[A-Z][a-z]+ county'
    ORDER BY name LIMIT 30
  `;
  out.odd_punctuation_names = oddPunct;

  // 12. distinct neighborhoods sample (to understand metro coverage)
  const neighborhoods = await sql`
    SELECT neighborhood, COUNT(*)::int AS n FROM businesses
    GROUP BY neighborhood ORDER BY n DESC LIMIT 50
  `;
  out.neighborhoods_top50 = neighborhoods;

  const neighborhoodCount = await sql`
    SELECT COUNT(DISTINCT neighborhood)::int AS n FROM businesses
  `;
  out.neighborhood_distinct = neighborhoodCount[0].n;

  // 13. icons tier slug count vs leaderboard count
  const iconRows = await sql`
    SELECT COUNT(*)::int AS n FROM scores WHERE tier = 'icons'
  `;
  out.scores_icons_count = iconRows[0].n;

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
