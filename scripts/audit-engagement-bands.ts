#!/usr/bin/env tsx
/**
 * scripts/audit-engagement-bands.ts
 *
 * Dump the per-family distribution of the new qualitative engagement
 * bands ("above", "typical", "quiet") to verify the baseline math
 * looks sane city-wide before we ship.
 *
 * Usage:
 *   npx tsx scripts/audit-engagement-bands.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { loadAllBusinesses } from "@/lib/data/load-business";
import { loadSocialBySlug } from "@/lib/data/load-social";
import { familyForBusinessCategory } from "@/lib/data/category-family";
import {
  computeFamilyEngagementBaselines,
  engagementBandForBusiness,
} from "@/lib/editorial/category-baseline";

async function main() {
  const all = await loadAllBusinesses();
  const rich = all.map((artifact) => ({
    artifact,
    social: loadSocialBySlug(artifact.business.slug),
  }));

  const baselines = computeFamilyEngagementBaselines(rich);

  // Per-family counts: above / typical / quiet / no-data
  const counts = new Map<
    string,
    {
      label: string;
      sampleSize: number;
      baseline: number;
      above: number;
      typical: number;
      quiet: number;
      noData: number;
    }
  >();

  for (const b of rich) {
    const fam = familyForBusinessCategory(b.artifact.business.category);
    const bl = baselines.get(fam.key);
    const c = counts.get(fam.key) ?? {
      label: fam.label,
      sampleSize: bl?.sampleSize ?? 0,
      baseline: bl?.baseline ?? 0,
      above: 0,
      typical: 0,
      quiet: 0,
      noData: 0,
    };

    const res = engagementBandForBusiness(b, baselines);
    if (!res) c.noData += 1;
    else if (res.band === "above") c.above += 1;
    else if (res.band === "quiet") c.quiet += 1;
    else c.typical += 1;

    counts.set(fam.key, c);
  }

  // Print sorted by family label
  const rows = Array.from(counts.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  console.log("");
  console.log(
    `Family                        | Sample | Baseline | Above | Typical | Quiet | No data`,
  );
  console.log(
    `------------------------------+--------+----------+-------+---------+-------+--------`,
  );
  for (const r of rows) {
    const baselinePct = (r.baseline * 100).toFixed(2) + "%";
    const flag = r.sampleSize > 0 && r.sampleSize < 3 ? " <- LOW" : "";
    console.log(
      `${r.label.padEnd(29)} | ${String(r.sampleSize).padStart(6)} | ${baselinePct.padStart(8)} | ${String(r.above).padStart(5)} | ${String(r.typical).padStart(7)} | ${String(r.quiet).padStart(5)} | ${String(r.noData).padStart(6)}${flag}`,
    );
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
