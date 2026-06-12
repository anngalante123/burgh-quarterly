/**
 * Backfill businesses.lat/lng and granular neighborhoods from data we
 * already own. The 2026-06-11 audit found 1,184 rows with the generic
 * "Pittsburgh" neighborhood and (surprise) zero rows with coordinates,
 * even though the raw Apify records on disk carry location + city + zip.
 *
 * Three passes, all keyed on place_id:
 *   1. coords:   businesses.lat/lng <- raw Apify `location` (any row missing them)
 *   2. suburbs:  generic-"Pittsburgh" rows whose address city is NOT
 *                Pittsburgh get the city name as their neighborhood
 *                (e.g. "Mt. Lebanon", "Sewickley").
 *   3. polygons: generic in-city rows with coords get a real neighborhood
 *                via point-in-polygon against the City of Pittsburgh
 *                neighborhood boundaries GeoJSON (WPRDC open data),
 *                expected at data/pgh-neighborhoods.geojson. Skipped with
 *                a note if the file is absent.
 *
 * Dry-run by default; --execute writes (with a snapshot of prior values).
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);
const EXECUTE = process.argv.includes("--execute");

const RAW_DIR = path.join(process.cwd(), "content/raw/apify");
const GEOJSON_PATH = path.join(process.cwd(), "data/pgh-neighborhoods.geojson");

interface GeoEntry {
  lat: number | null;
  lng: number | null;
  city: string | null;
  zip: string | null;
}

function buildGeoMap(): Map<string, GeoEntry> {
  const map = new Map<string, GeoEntry>();
  for (const f of fs.readdirSync(RAW_DIR)) {
    if (!f.endsWith(".json")) continue;
    let recs: unknown;
    try {
      recs = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), "utf8"));
    } catch {
      continue;
    }
    if (!Array.isArray(recs)) continue;
    for (const r of recs as Record<string, any>[]) {
      if (!r.placeId) continue;
      map.set(r.placeId, {
        lat: r.location?.lat ?? null,
        lng: r.location?.lng ?? null,
        city: r.city ?? null,
        zip: r.postalCode ?? null,
      });
    }
  }
  return map;
}

/* ---------------- point-in-polygon (ray casting, lon/lat) ---------------- */

type Ring = [number, number][];

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function inPolygon(lng: number, lat: number, coords: Ring[]): boolean {
  // First ring is the outer boundary; the rest are holes.
  if (!coords.length || !inRing(lng, lat, coords[0])) return false;
  for (let i = 1; i < coords.length; i++) {
    if (inRing(lng, lat, coords[i])) return false;
  }
  return true;
}

interface HoodFeature {
  name: string;
  polygons: Ring[][];
}

function loadHoods(): HoodFeature[] | null {
  if (!fs.existsSync(GEOJSON_PATH)) return null;
  const gj = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  const out: HoodFeature[] = [];
  for (const feat of gj.features ?? []) {
    const name =
      feat.properties?.hood ??
      feat.properties?.name ??
      feat.properties?.NAME ??
      feat.properties?.neighborhood;
    if (!name || !feat.geometry) continue;
    const g = feat.geometry;
    const polygons: Ring[][] =
      g.type === "Polygon"
        ? [g.coordinates]
        : g.type === "MultiPolygon"
          ? g.coordinates
          : [];
    if (polygons.length) out.push({ name, polygons });
  }
  return out;
}

function hoodFor(lng: number, lat: number, hoods: HoodFeature[]): string | null {
  for (const h of hoods) {
    for (const poly of h.polygons) {
      if (inPolygon(lng, lat, poly)) return h.name;
    }
  }
  return null;
}

/* --------------------------------- main ---------------------------------- */

async function main() {
  console.log(EXECUTE ? "EXECUTE mode" : "DRY-RUN (pass --execute to write)");
  const geo = buildGeoMap();
  console.log("raw Apify placeIds with location:", geo.size);

  const hoods = loadHoods();
  console.log(
    hoods
      ? `neighborhood polygons loaded: ${hoods.length}`
      : "no data/pgh-neighborhoods.geojson; polygon pass will be skipped",
  );

  const rows = (await sql`
    select slug, place_id, address, neighborhood, lat, lng from businesses
  `) as {
    slug: string;
    place_id: string | null;
    address: string;
    neighborhood: string;
    lat: number | null;
    lng: number | null;
  }[];

  const coordUpdates: { slug: string; lat: number; lng: number }[] = [];
  const hoodUpdates: {
    slug: string;
    from: string;
    to: string;
    via: "suburb" | "polygon";
  }[] = [];

  for (const r of rows) {
    const g = r.place_id ? geo.get(r.place_id) : undefined;
    const lat = r.lat ?? g?.lat ?? null;
    const lng = r.lng ?? g?.lng ?? null;

    if (r.lat == null && g?.lat != null && g?.lng != null) {
      coordUpdates.push({ slug: r.slug, lat: g.lat, lng: g.lng });
    }

    if (!/^pittsburgh$/i.test(r.neighborhood.trim())) continue;

    const m = r.address.match(/,\s*([^,]+),\s*PA\b/i);
    const city = m ? m[1].trim() : null;
    if (city && city.toLowerCase() !== "pittsburgh") {
      hoodUpdates.push({
        slug: r.slug,
        from: r.neighborhood,
        to: city,
        via: "suburb",
      });
    } else if (hoods && lat != null && lng != null) {
      const hood = hoodFor(lng, lat, hoods);
      if (hood) {
        hoodUpdates.push({
          slug: r.slug,
          from: r.neighborhood,
          to: hood,
          via: "polygon",
        });
      }
    }
  }

  const bySource = { suburb: 0, polygon: 0 };
  for (const u of hoodUpdates) bySource[u.via]++;
  console.log(`coord updates: ${coordUpdates.length}`);
  console.log(
    `neighborhood updates: ${hoodUpdates.length} (suburb ${bySource.suburb}, polygon ${bySource.polygon})`,
  );
  console.log("samples:", hoodUpdates.slice(0, 8));

  if (!EXECUTE) {
    console.log("\nDry-run complete. No writes.");
    return;
  }

  // snapshot prior values
  const p = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const backupPath = path.join(
    process.cwd(),
    "scripts/backups",
    `geo-backfill-${ts}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ coordUpdates, hoodUpdates, prior: rows }, null, 2),
  );
  console.log("snapshot written:", backupPath);

  for (const u of coordUpdates) {
    await sql`update businesses set lat = ${u.lat}, lng = ${u.lng} where slug = ${u.slug}`;
  }
  console.log("coords written:", coordUpdates.length);
  for (const u of hoodUpdates) {
    await sql`update businesses set neighborhood = ${u.to} where slug = ${u.slug}`;
  }
  console.log("neighborhoods written:", hoodUpdates.length);

  const left = await sql`
    select count(*) from businesses where neighborhood ilike 'pittsburgh'
  `;
  console.log("generic 'Pittsburgh' rows remaining:", left[0].count);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
