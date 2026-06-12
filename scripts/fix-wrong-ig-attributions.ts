/**
 * Fix wrong Instagram attributions found in the 2026-06-11 audit.
 *
 * The IG discovery pipeline matched 29 businesses to handles that belong
 * to a DIFFERENT entity: website builders (squarespace, wix), parent orgs
 * (culturaltrust, omnihotels, lifeatcmu, pittsburghparks), or the venue
 * that contains them (frick/warhol/carnegie cafes, gandy-dancer, lexus-club).
 * Their momentum subscore was measuring someone else's account.
 *
 * Rule applied: null the IG record when the handle's owner is a different
 * brand. Same-brand multi-location handles (sliceonbroadway, yinzcoffee,
 * lagourmandinebakery...) are LEGIT and untouched; list-level dedupe in
 * lib/lists/own-posts-pool.ts already handles those surfaces.
 *
 * Mechanism: content/social/<slug>.json keeps growth + tiktok_mentions but
 * its IG fields are replaced by { error: "wrong_attribution" }.
 * loadSocialBySlug() treats `error` as ig=null, so scoring rebalances via
 * skipMomentum and the UI renders the no-IG empty state. handles.json gets
 * instagram_handle=null + a note so a future discovery run doesn't re-match.
 *
 * Also deletes the one true duplicate row found in the audit:
 * burghers-brewing-tap-house-lawrenceville (stale 49-review Google listing;
 * burghers-brewing-company-lawrenceville-tap-house, 701 reviews, stays).
 *
 * Dry-run by default; --execute writes. Originals snapshotted first.
 */
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const sql = neon(process.env.DATABASE_URL!);
const EXECUTE = process.argv.includes("--execute");

const WRONG: Record<string, string[]> = {
  squarespace: [
    "house-of-shish-kebabs",
    "la-bodega",
    "results-fitness-gym-strength-and-endurance",
    "studio-39-fitness",
    "urban-jungle-of-regent-square",
    "uzbek-food",
    "wiggys",
  ],
  wix: [
    "delucas-diner",
    "lotus-spa-cebpki",
    "pgh-nailworks-co-formerly-paint-nail-bar-pittsburgh",
    "steam-beauty-and-wellness-spa",
    "the-spiice-route-indian-restaurant",
  ],
  culturaltrust: [
    "707-penn-gallery",
    "benedum-center-for-the-performing-arts",
    "greer-cabaret-theater",
    "space",
    "wood-street-galleries",
  ],
  omnihotels: ["the-speakeasy", "the-tap-room", "the-terrace-room"],
  ppgpaintsarena: ["lexus-club"],
  lifeatcmu: ["stackd-underground", "the-exchange-restaurant"],
  pittsburghparks: ["schenley-park-visitor-center", "schenley-plaza"],
  frickpittsburgh: ["the-cafe-at-the-frick"],
  thewarholmuseum: ["the-warhol-cafe"],
  carnegiemuseums: ["carnegie-music-hall"],
  grandconcoursepa: ["gandy-dancer-saloon"],
};

const DUP_DELETE = "burghers-brewing-tap-house-lawrenceville";

const SOCIAL_DIR = path.join(process.cwd(), "content/social");

function ts() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  console.log(EXECUTE ? "EXECUTE mode" : "DRY-RUN (pass --execute to write)");

  const originals: Record<string, unknown> = {};
  const planned: { slug: string; handle: string }[] = [];

  for (const [handle, slugs] of Object.entries(WRONG)) {
    for (const slug of slugs) {
      const f = path.join(SOCIAL_DIR, `${slug}.json`);
      if (!fs.existsSync(f)) {
        console.log("MISSING social JSON:", slug);
        continue;
      }
      const raw = JSON.parse(fs.readFileSync(f, "utf8"));
      const rec = Array.isArray(raw) ? raw[0] : raw;
      const actual = (rec?.handle ?? "").toLowerCase();
      if (actual !== handle) {
        console.log(`SKIP ${slug}: handle is '${actual}', expected '${handle}'`);
        continue;
      }
      originals[slug] = raw;
      planned.push({ slug, handle });
    }
  }
  console.log(`IG records to null: ${planned.length}`);
  console.log(`dup row to delete: ${DUP_DELETE}`);

  if (!EXECUTE) {
    console.log("\nDry-run complete. No writes.");
    return;
  }

  // snapshot: original social JSONs + the dup row's DB records
  const dupRows: Record<string, unknown> = {};
  for (const table of [
    "businesses",
    "business_signals",
    "business_photos",
    "business_reviews",
    "scores",
    "analyses",
  ]) {
    const col = table === "businesses" ? "slug" : "business_slug";
    dupRows[table] = await sql.query(
      `select * from ${table} where ${col} = $1`,
      [DUP_DELETE],
    );
  }
  const backupPath = path.join(
    process.cwd(),
    "scripts/backups",
    `wrong-ig-fix-${ts()}.json`,
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ socialOriginals: originals, dupRows }, null, 2),
  );
  console.log("snapshot written:", backupPath);

  // null the wrong IG records, keep growth + tiktok blocks
  for (const { slug, handle } of planned) {
    const f = path.join(SOCIAL_DIR, `${slug}.json`);
    const raw = JSON.parse(fs.readFileSync(f, "utf8"));
    const rec = Array.isArray(raw) ? raw[0] : raw;
    const replacement = {
      slug,
      error: "wrong_attribution",
      errorDescription: `IG handle '${handle}' belongs to a different entity; removed 2026-06-12 audit fix`,
      growth: rec?.growth ?? null,
      tiktok_mentions: rec?.tiktok_mentions ?? null,
    };
    fs.writeFileSync(f, JSON.stringify(replacement, null, 2) + "\n");
  }
  console.log("social JSONs nulled:", planned.length);

  // handles.json: prevent re-match on the next discovery run
  const handlesPath = path.join(SOCIAL_DIR, "handles.json");
  const handles = JSON.parse(fs.readFileSync(handlesPath, "utf8")) as Record<
    string,
    unknown
  >[];
  const nulledSlugs = new Set(planned.map((p) => p.slug));
  for (const h of handles) {
    if (nulledSlugs.has(h.slug as string)) {
      h.instagram_handle = null;
      h.discovery_method = "rejected_wrong_attribution";
      h.notes = "handle belonged to a different entity (2026-06-12 audit fix)";
    }
  }
  fs.writeFileSync(handlesPath, JSON.stringify(handles, null, 2) + "\n");
  console.log("handles.json updated");

  // delete the duplicate row (children cascade)
  const deleted = await sql`
    delete from businesses where slug = ${DUP_DELETE} returning slug, name
  `;
  console.log("dup deleted:", deleted);

  // remove its social JSON too
  const dupSocial = path.join(SOCIAL_DIR, `${DUP_DELETE}.json`);
  if (fs.existsSync(dupSocial)) fs.unlinkSync(dupSocial);
  const kept = (
    JSON.parse(fs.readFileSync(handlesPath, "utf8")) as { slug: string }[]
  ).filter((h) => h.slug !== DUP_DELETE);
  fs.writeFileSync(handlesPath, JSON.stringify(kept, null, 2) + "\n");
  console.log("dup social JSON + handles entry removed");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
