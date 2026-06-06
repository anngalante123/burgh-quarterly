#!/usr/bin/env tsx
/**
 * sync-hero-photo.ts, point businesses.hero_photo at the self-hosted Blob
 * URL. The business page renders `hero_photo || photos[0].url`, so a stale
 * hero_photo (expired Google URL) was overriding the re-hosted blob photo.
 * DB-only, no spend. Dry-run by default; --execute to write.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.join(process.cwd(), ".env.local") }); loadEnv();
import { and, eq, sql } from "drizzle-orm";
async function main(){
  const execute = process.argv.includes("--execute");
  const { db, schema } = await import("@/lib/db/client");
  // hero photo (sort_order 0) that is now self-hosted on blob
  const rows = await db.select({slug:schema.businessPhotos.business_slug, url:schema.businessPhotos.url})
    .from(schema.businessPhotos)
    .where(and(eq(schema.businessPhotos.sort_order,0), sql`${schema.businessPhotos.url} like '%blob.vercel-storage%'`));
  console.log(`[sync] ${rows.length} self-hosted hero photos found; mode=${execute?"EXECUTE":"dry-run"}`);
  if(!execute){ console.log("[sync] dry run, pass --execute to write hero_photo."); return; }
  let n=0;
  for(const r of rows){
    await db.update(schema.businesses).set({hero_photo: r.url}).where(eq(schema.businesses.slug, r.slug));
    n++; if(n%500===0) console.log(`[sync] ${n}/${rows.length}`);
  }
  console.log(`[sync] DONE, updated hero_photo on ${n} businesses`);
}
main().then(()=>process.exit(0));
