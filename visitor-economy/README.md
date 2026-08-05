# The Visitor Economy

**Lives inside the burgh-quarterly repo but is not part of signalpittsburgh.com.**
It has its own `package.json`, its own build, and needs its own Vercel project
and domain. Three guards keep it out of the live site's build, and all three
must stay in sync if this folder is ever renamed:

| File | Entry |
|---|---|
| `../tsconfig.json` | `"exclude": [..., "visitor-economy"]` |
| `../.vercelignore` | `visitor-economy` |
| `../eslint.config.mjs` | `"visitor-economy/**"` in `globalIgnores` |

Verify the live site cannot see it:

```bash
cd .. && npx tsc --noEmit --listFilesOnly | grep -c visitor-economy   # must be 0
```

A destination-marketing version of Signal Pittsburgh. It ranks US tourism
offices and CVBs on **creator readiness** — how far a creator would get if they
tried to work with that office tomorrow.

Sibling publication to [Signal Pittsburgh](https://signalpittsburgh.com).
Published by Relay.

---

## ⚠ Not ready to publish yet

Two blockers, both deliberate:

1. **The rubric has not been calibrated.** Signal Pittsburgh's scoring protocol
   requires Anna to gut-rate a sample of entries 0–100 per signal, and the
   scorer to be tuned until it lands within ±7 points. That has not happened
   here. Until it does, every tier assignment is provisional and must not go
   public. See "Calibration" below.
2. **18 of the 50 state offices are unranked** because their sites block
   automated requests. Fixable — see "Known gaps".

Everything else works: the pipeline runs end to end, the site builds, and the
data is honest about what it doesn't know.

---

## Pipeline

```
Clay workbook  (wb_0ti6eiafhApXTGcBDh7, workspace 490803)
  → data/raw/*.csv          9 tables exported by hand from Clay's Tools → Export
  + data/seed-orgs.csv      orgs the Clay export missed, added by hand
  → scripts/normalize.py    dedupe + normalise      → data/orgs.json
  → scripts/crawl.py        read each org's site    → data/crawl.json
  → scripts/score.py        5-signal composite      → data/index.json
                            (the app imports this file directly)
```

Run it:

```bash
python3 scripts/normalize.py
python3 scripts/crawl.py            # or: crawl.py state|county|city
python3 scripts/score.py
npm run dev                         # port 3021
```

`crawl.py` resumes from `data/crawl.json`, so it is safe to re-run. **Do not run
two tiers at once** — they share that file and the second one to finish wins.

---

## The five signals

| # | Signal | Weight | Source |
|---|---|---|---|
| 1 | Partner path | 30% | site crawl |
| 2 | Destination canvas | 20% | site crawl |
| 3 | Social footprint | 20% | site crawl |
| 4 | Team capacity | 20% | Clay |
| 5 | Decision access | 10% | Clay |

Every subscore's point budget sums to exactly 100. This matters: an earlier
version let one signal top out at 70 while another reached 100, which silently
biased the composite toward whichever signals had a reachable ceiling.

**Coverage rule.** Signals 1–3 need the org's own website. Some sites turn away
automated requests at the WAF. A block is not evidence of a weak signal — it is
evidence of *no* signal. Those subscores are recorded as `null`, dropped from
the composite, and the remainder is renormalised. An org measured on less than
half its weight gets **no tier at all** and is published as "Not yet measured".

`score.py` never scores a WAF block as zero, and it never fills a gap with a
guess. If you change this, you change what the index means.

---

## Privacy

The Clay source data contains ~1,800 named individuals with job titles and
LinkedIn URLs. **None of it reaches the public site.**

- `normalize.py` keeps contact data under an `internal` key in `data/orgs.json`.
- `score.py` strips `internal` before writing `data/index.json`.
- Only aggregate counts (`teamCount`, `qualifiedCount`) survive into the site.
- No page or component references an individual's name.

`data/orgs.json` holds personal data. Do not commit it to a public repo and do
not deploy it. Only `data/index.json` is safe to ship.

**The composite score is also internal.** It exists in `index.json` as `score`
but is never rendered — the "gap, not grade" rule inherited from Signal
Pittsburgh. Pages show a tier label and a rank position, nothing numeric about
the score itself. Verify with:

```bash
grep -rn "\.score" web/app web/components | grep -v subscores
```

That should return nothing.

---

## Known gaps

**18 of 50 state offices are unranked.** Their sites (travelalaska.com,
michigan.org, visitmaine.com, colorado.com, and 14 others) return 403 to
automated requests. We do not attempt to work around bot detection. The fix is
to fetch those pages through a service that renders them legitimately — Apify's
website-content-crawler is already in the Relay stack and handles this. Roughly
$1–3 for the 33 blocked orgs across all tiers.

**County and city tiers are not published.** 116 of 137 county orgs and 95 of
110 city orgs score fine, but the source list is 43% concentrated in nine
Northeast states and 13 states have only one or two entries. A rank drawn from
that field would flatter whichever region happens to be best represented. They
stay out of the ranked index until coverage evens out.

**Social is presence, not momentum.** The index currently sees whether an
office has an Instagram or TikTok account and links it. It does not see posting
cadence, follower count, or engagement. That needs an Instagram pass — the same
Apify actor Signal Pittsburgh uses. Until it lands, `score_social` is measuring
something much thinner than its 20% weight implies, and that is the single
biggest weakness in the rubric.

**State offices score lower than regional bureaus.** 1 of 32 measured state
offices reaches the top tier, versus 15 of 116 counties and 8 of 95 cities.
That may be real — regional CVBs are scrappier and likelier to publish an
explicit "work with us" page — or it may be an artifact of WAF blocking hitting
big state sites hardest. Do not quote this as a finding until the blocked
offices are measured.

---

## The Washington County case study

`/case-study/washington-county` is the flagship piece and the reason the
rubric is framed the way it is. Research behind it: `.claude/memory/GRADED_ON.md`.

The finding worth remembering: **the metrics a DMO marketing coordinator
personally controls are the ones their board has stopped accepting.**
Destinations International now splits reporting into direct indicators (room
tax, occupancy, trips, visitor spending, ROAS, attribution) and indirect ones
(CTR, impressions, website traffic) — and everything a social media
coordinator produces sits on the indirect list. Creator work is the only
layer-3 activity that yields layer-1 evidence, because it has names and faces
attached.

Washington County makes it concrete: ~$2.2m a year in hotel tax, 96% of which
goes to the tourism agency, and commissioners who moved in December 2025 to
redirect 75% of it toward a convention centre. ⚠ That reporting is from
December 2025 and no resolution was found — do not state the current status to
anyone, least of all the account.

Every claim on that page is generated from crawled data via
`lib/reporting.ts`, not hand-written. Two contradictions were caught during
the build (the page asserted an asset library the office does not have, and
denied a media page it does). The fix was to read `subscoreNotes` rather than
the composite subscore — **a subscore of 40 does not tell you which of its
components fired.** Keep it that way.

## Calibration

Before anything is published, per Signal Pittsburgh's protocol:

1. Pick 8–10 offices spanning all three tiers.
2. Anna gut-rates each of the five signals 0–100, without seeing the output.
3. Compare. Adjust the point budgets in `score.py` until the scorer lands
   within ±7 points on every signal.
4. Only then is a tier label safe to show anyone outside the team.

Current uncalibrated distribution (state tier, 32 measured): 1 Setting the
Pace, 10 Building Momentum, 21 Untapped. Median composite 54.
