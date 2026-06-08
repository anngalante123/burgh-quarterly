# Issue baselines (frozen, immutable)

Each `baselines/<issue>/` folder is a point-in-time freeze of that quarterly
issue's core data, captured by `scripts/snapshot-issue-db.ts`. These exist so a
later quarter can measure change (score/tier/rank movement, roster adds/drops,
editorial shifts) even if the live database rows are later overwritten.

**Do not regenerate a baseline once frozen.** It is the historical record.

## Contents (gzipped JSON)
- `scores.json.gz` ........ composite, tier, subscores, ranks per business (the key file for movement)
- `business_signals.json.gz` rating, review counts, IG inputs
- `businesses.json.gz` .... roster + identity (for adds/drops)
- `analyses.json.gz` ...... editorial: diagnosis, themes, playbook
- `export-businesses.csv.gz` human-readable per-business row dump
- `MANIFEST.json` ......... issue, frozen_at timestamp, row counts

## How to use next quarter
1. Run the summer pipeline as a NEW issue (`issue_slug = 2026-summer`), never overwriting spring.
2. Freeze it too: `npx tsx scripts/snapshot-issue-db.ts --issue 2026-summer`.
3. Compute movement by diffing summer scores against `baselines/2026-spring/scores.json.gz`
   (match on business_slug; compare composite, tier, and ranks). Write the result into
   the `scores.movement` jsonb field so the site can show up/down vs last quarter.
