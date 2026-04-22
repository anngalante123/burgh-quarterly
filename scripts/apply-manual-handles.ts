#!/usr/bin/env tsx
/**
 * Apply manual handle overrides discovered via web search for the residual
 * businesses that Apify search couldn't resolve.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const HANDLES = join(resolve(__dirname, ".."), "content", "social", "handles.json");

interface HandleRecord {
  slug: string;
  name: string;
  website: string | null;
  instagram_handle: string | null;
  discovery_method: "website_link" | "search_match" | "manual" | "none";
  confidence: "high" | "medium" | "low" | null;
  notes?: string;
}

const MANUAL: Record<string, { handle: string; confidence: "high" | "medium"; note: string }> = {
  "delanies-coffee-shadyside": {
    handle: "delaniescoffee",
    confidence: "high",
    note: "manual (web search confirmed @delaniescoffee is the shared account across both Delanie's locations incl. Shadyside)",
  },
  "meetcha": {
    handle: "meetcha_pgh",
    confidence: "high",
    note: "manual (web search confirmed @meetcha_pgh matches meetchapa.com)",
  },
  "reva-modern-indian-cuisine": {
    handle: "reva_pgh",
    confidence: "high",
    note: "manual (web search confirmed @reva_pgh is Reva Modern Indian Cuisine)",
  },
};

async function main(): Promise<void> {
  const handles = JSON.parse(await readFile(HANDLES, "utf8")) as HandleRecord[];
  let updated = 0;
  for (const h of handles) {
    const m = MANUAL[h.slug];
    if (m && !h.instagram_handle) {
      h.instagram_handle = m.handle;
      h.discovery_method = "manual";
      h.confidence = m.confidence;
      h.notes = m.note;
      updated += 1;
    }
  }
  await writeFile(HANDLES, JSON.stringify(handles, null, 2) + "\n", "utf8");
  const found = handles.filter((h) => h.instagram_handle).length;
  console.log(`[manual] updated ${updated}; ${found}/${handles.length} handles resolved.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
