/* eslint-disable no-console */
/**
 * Sweep additional banned phrases beyond "discovery" and "infrastructure":
 *   - "punching above"        -> "running ahead of"
 *   - "moving the needle"     -> "shifting the rank"
 *   - "leverage" / "leveraging" -> "impact" / "tapping"  (very narrow rules)
 *   - "amplify" family        -> rewrite by form
 *
 * Mirrors scripts/sweep-discovery-word.ts conventions.
 *
 * Usage:
 *   tsx scripts/sweep-misc-banned-words.ts              # dry-run
 *   tsx scripts/sweep-misc-banned-words.ts --commit     # apply
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const COMMIT = process.argv.includes("--commit");

type Rule = { pat: RegExp; rep: string };

const RULES: Rule[] = [
  // ---- punching above ----
  { pat: /\bpunching above its weight\b/gi, rep: "running ahead of its weight" },
  { pat: /\bpunching above the family average\b/gi, rep: "running ahead of the family average" },
  { pat: /\bpunching above its\b/gi, rep: "running ahead of its" },
  { pat: /\bpunching above\b/gi, rep: "running ahead of" },

  // ---- moving the needle ----
  { pat: /\bnot moving the needle fast enough\b/gi, rep: "not shifting the rank fast enough" },
  { pat: /\bnot moving the needle\b/gi, rep: "not shifting the rank" },
  { pat: /\bmoving the needle\b/gi, rep: "shifting the rank" },

  // ---- leverage (noun forms; we already renamed Playbook.tsx) ----
  { pat: /\bhighest-leverage fix\b/gi, rep: "highest-impact fix" },
  { pat: /\bhighest-leverage\b/gi, rep: "highest-impact" },
  { pat: /\bhigh-leverage\b/gi, rep: "high-impact" },
  { pat: /\blow-leverage\b/gi, rep: "low-impact" },
  { pat: /\blowest-leverage\b/gi, rep: "lowest-impact" },
  { pat: /\bleverage point\b/gi, rep: "impact point" },
  { pat: /\bleverage points\b/gi, rep: "impact points" },
  // verb form
  { pat: /\bleveraging\b/gi, rep: "tapping" },
  { pat: /\bleveraged\b/gi, rep: "tapped" },
  { pat: /\bleverages\b/gi, rep: "taps" },
  { pat: /\bleverage\b/gi, rep: "impact" },

  // ---- amplify family ----
  { pat: /\bamplifying layer\b/gi, rep: "visibility layer" },
  { pat: /\bamplifying surface\b/gi, rep: "visibility surface" },
  { pat: /\bdigital amplifier\b/gi, rep: "digital megaphone" },
  { pat: /\bdigital amplification\b/gi, rep: "digital visibility" },
  { pat: /\bsocial amplifier\b/gi, rep: "social megaphone" },
  { pat: /\bsocial amplification\b/gi, rep: "social visibility" },
  { pat: /\bvisual amplifier\b/gi, rep: "visual megaphone" },
  { pat: /\bno amplifier\b/gi, rep: "no megaphone" },
  { pat: /\bamplification layer\b/gi, rep: "visibility layer" },
  { pat: /\bamplifying it\b/gi, rep: "carrying it forward" },
  { pat: /\bamplifying the\b/gi, rep: "compounding the" },
  { pat: /\bamplifying\b/gi, rep: "carrying" },
  { pat: /\bamplification\b/gi, rep: "visibility" },
  { pat: /\bamplified\b/gi, rep: "carried further" },
  { pat: /\bamplifies\b/gi, rep: "carries" },
  { pat: /\bamplifier\b/gi, rep: "megaphone" },
  { pat: /\bamplify\b/gi, rep: "spread" },
];

function isShouty(s: string): boolean {
  const letters = s.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-Z]/g, "");
  return upper.length / letters.length >= 0.7;
}

function rewriteString(s: string): { changed: boolean; out: string } {
  let out = s;
  for (const { pat, rep } of RULES) {
    out = out.replace(pat, rep);
  }
  if (isShouty(s)) {
    out = out.toUpperCase();
  }
  return { changed: out !== s, out };
}

const TEXT_KEYS = new Set([
  "action",
  "headline",
  "impact_label",
  "phrase",
  "line",
  "highlight",
]);

function rewriteAny(value: unknown, parentKey?: string): { changed: boolean; out: unknown } {
  if (typeof value === "string") {
    if (parentKey && !TEXT_KEYS.has(parentKey)) {
      return { changed: false, out: value };
    }
    return rewriteString(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = rewriteAny(v, parentKey);
      if (r.changed) changed = true;
      return r.out;
    });
    return { changed, out };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = rewriteAny(v, k);
      if (r.changed) changed = true;
      out[k] = r.out;
    }
    return { changed, out };
  }
  return { changed: false, out: value };
}

type AnalysisRow = {
  business_slug: string;
  issue_slug: string;
  themes: unknown;
  notable_quote: string | null;
  sentiment_summary: string | null;
  quarter_narrative: string | null;
  tldr_read: string | null;
  tldr_meaning: string | null;
  diagnosis_pullquote: unknown;
  playbook: unknown;
};

const FILTER = `(playbook::text ~* '\\m(punching above|moving the needle|leverag|amplif)' OR
  diagnosis_pullquote::text ~* '\\m(punching above|moving the needle|leverag|amplif)' OR
  (tldr_read IS NOT NULL AND tldr_read ~* '\\m(punching above|moving the needle|leverag|amplif)') OR
  (tldr_meaning IS NOT NULL AND tldr_meaning ~* '\\m(punching above|moving the needle|leverag|amplif)') OR
  (sentiment_summary IS NOT NULL AND sentiment_summary ~* '\\m(punching above|moving the needle|leverag|amplif)') OR
  (themes IS NOT NULL AND themes::text ~* '\\m(punching above|moving the needle|leverag|amplif)') OR
  (quarter_narrative IS NOT NULL AND quarter_narrative ~* '\\m(punching above|moving the needle|leverag|amplif)'))`;

async function main() {
  console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY RUN"}`);

  const rows = (await sql.query(
    `SELECT business_slug, issue_slug, themes, notable_quote, sentiment_summary,
       quarter_narrative, tldr_read, tldr_meaning, diagnosis_pullquote, playbook
     FROM analyses
     WHERE ${FILTER}`,
  )) as AnalysisRow[];

  console.log(`Found ${rows.length} rows with a hit.`);

  let updated = 0;
  let skippedNoChange = 0;

  for (const r of rows) {
    const next = {
      themes: rewriteAny(r.themes),
      sentiment_summary: r.sentiment_summary ? rewriteString(r.sentiment_summary) : null,
      quarter_narrative: r.quarter_narrative ? rewriteString(r.quarter_narrative) : null,
      tldr_read: r.tldr_read ? rewriteString(r.tldr_read) : null,
      tldr_meaning: r.tldr_meaning ? rewriteString(r.tldr_meaning) : null,
      diagnosis_pullquote: rewriteAny(r.diagnosis_pullquote),
      playbook: rewriteAny(r.playbook),
    };

    const anyChanged =
      next.themes.changed ||
      (next.sentiment_summary?.changed ?? false) ||
      (next.quarter_narrative?.changed ?? false) ||
      (next.tldr_read?.changed ?? false) ||
      (next.tldr_meaning?.changed ?? false) ||
      next.diagnosis_pullquote.changed ||
      next.playbook.changed;

    if (!anyChanged) {
      skippedNoChange++;
      continue;
    }

    if (updated < 5) {
      console.log(`\n--- ${r.business_slug} (${r.issue_slug}) ---`);
      if (next.tldr_read?.changed) {
        console.log("  tldr_read AFTER: ", next.tldr_read.out.slice(0, 240));
      }
      if (next.tldr_meaning?.changed) {
        console.log("  tldr_meaning AFTER: ", next.tldr_meaning.out.slice(0, 240));
      }
      if (next.quarter_narrative?.changed) {
        console.log("  qn AFTER: ", next.quarter_narrative.out.slice(0, 240));
      }
      if (next.sentiment_summary?.changed) {
        console.log("  sentiment AFTER: ", next.sentiment_summary.out.slice(0, 240));
      }
      if (next.playbook.changed) {
        console.log("  playbook AFTER:", JSON.stringify(next.playbook.out).slice(0, 400));
      }
    }

    if (COMMIT) {
      const newSentiment = next.sentiment_summary?.changed
        ? next.sentiment_summary.out
        : r.sentiment_summary;
      const newQN = next.quarter_narrative?.changed
        ? next.quarter_narrative.out
        : r.quarter_narrative;
      const newTldrRead = next.tldr_read?.changed ? next.tldr_read.out : r.tldr_read;
      const newTldrMeaning = next.tldr_meaning?.changed
        ? next.tldr_meaning.out
        : r.tldr_meaning;

      await sql`
        UPDATE analyses SET
          themes = ${JSON.stringify(next.themes.out)}::jsonb,
          sentiment_summary = ${newSentiment},
          quarter_narrative = ${newQN},
          tldr_read = ${newTldrRead},
          tldr_meaning = ${newTldrMeaning},
          diagnosis_pullquote = ${next.diagnosis_pullquote.out === null ? null : JSON.stringify(next.diagnosis_pullquote.out)}::jsonb,
          playbook = ${next.playbook.out === null ? null : JSON.stringify(next.playbook.out)}::jsonb
        WHERE business_slug = ${r.business_slug}
          AND issue_slug = ${r.issue_slug}
      `;
    }
    updated++;
  }

  console.log(`\nSummary:`);
  console.log(`  rows scanned: ${rows.length}`);
  console.log(`  rows ${COMMIT ? "updated" : "would be updated"}: ${updated}`);
  console.log(`  rows with hit but no rule matched: ${skippedNoChange}`);

  if (!COMMIT) {
    console.log(`\nDry run only. Re-run with --commit to apply.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
