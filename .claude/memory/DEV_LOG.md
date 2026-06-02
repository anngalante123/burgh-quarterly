# Dev Log

Dated entries, what shipped, what broke, where we left off. Append-only. Future Claude reads the last entry cold.

---

## 2026-04-21 — Session 001: Foundation

**Shipped:**
- Strategic direction locked via `product-delight` + `demand-gen-operator` skills: publication model (not lead magnet), quarterly cadence, three-tier gate architecture
- Project name (working): **The Burgh Quarterly**. Alternates kept in DECISIONS for easy find-replace if Anna picks differently.
- Brand tokens captured from Relay brand kit screenshot: purple/lime/black with Unbounded + DM Sans. Exact values in DECISIONS.md.
- Editorial voice locked and written to `EDITORIAL_VOICE.md` — the full copy kit from the `demand-gen-operator` pass, including the three traps to avoid and the loud/quiet asymmetry rule.
- Scoring rubric specified in `SCORING_RUBRIC.md` — 5-factor weighted model, tier thresholds, calibration protocol.
- Data model specified in `DATA_MODEL.md` — Business, Score, Issue, UnderratedList, Feature, LeadCapture.
- Lead capture architecture specified in `LEAD_CAPTURE.md` — 3 tiers (public / email gate / claim gate) with copy and data rules.
- Project dir scaffolded: `/Users/annamariegalante/burgh-quarterly/`
- Git initialized with repo-local identity (Anna Galante / annamarie.galante@blastpoint.com)
- CLAUDE.md + `.claude/MEMORY.md` index + all 8 memory files written

**Key strategic decisions (see DECISIONS.md for full):**
- The Underrated List is the low-tier conversion engine — don't call babies ugly, celebrate under-recognition
- Loud editorial / quiet record architecture lets features be opinionated without compromising the scorecard's neutrality
- Relay appears in exactly two places: colophon + one sidebar CTA on claimed pages
- Private/public split: public pages stay flattering; candid weakness diagnoses are opt-in via claim

**Blockers:**
- Need pilot business from Anna to calibrate the scoring rubric. Any Pittsburgh business she knows well enough to gut-rate each subscore.

**Next session picks up at:**
- Task #5 — scaffold Next.js app with Tailwind + shadcn
- Task #8 and #9 can't start until pilot business is picked (needed to render a real business page)

---

## 2026-04-21 — Session 001 continued: Apify data discovery

**Context:** Anna shared Apify API token + pointed at her existing scraper workspace.

**Shipped:**
- `.gitignore` + `.env.local` + `.env.example` created. Secrets are gitignored. Flagged Anna to rotate the token in Apify after project stabilizes.
- Mapped the full Apify workspace: **56 Pittsburgh tasks** (8 scraper slices × 7 verticals) using actor `compass/crawler-google-places`.
- Downloaded first dataset: `pit-dts-foodniche` (100 items) → `content/raw/apify/pit-dts-foodniche.json`. Covers Lawrenceville / Shadyside / East Liberty / Squirrel Hill / Bloomfield-heavy food.
- Identified **55 fields per record** including ratings, review distribution, image counts, categories, business-identity tags (Black-owned, Small business, Latino-owned, etc.), place IDs, coordinates.
- Decoded naming scheme (D-014): task prefixes are operational slices, not neighborhood filters — normalize by record-level `neighborhood`.
- Scanned 6 task types for pilot candidates meeting bar (open, 4.6+★, 100+ reviews, 30+ images). Shortlist in DECISIONS.md D-016.
- Also spotted in the workspace: `instagram-scraper`, `instagram-scraper---clay`, `pittsburgh-email-extractor`, `newsletter-relay-scraper` — Instagram data likely available for the Momentum subscore.

**Decisions recorded:**
- D-014: Apify Google Maps Scraper as data source, field-mapped
- D-015: Review text is NOT in current scrape — re-scrape required for full sentiment scoring. Gracefully degrades but flagged.
- D-016: Pilot shortlist with La Gourmandine as top pick

**Gotchas logged:** task ID vs dataset ID confusion; review text missing; neighborhood field sometimes null.

**Blockers:**
- Pilot business pick (shortlist ready — Anna just needs to name one)
- Decision on re-scrape with review text

**Next session picks up at:**
- Anna picks pilot (or defaults to La Gourmandine)
- Write `scripts/ingest-apify.ts` + `lib/data/normalize.ts`
- Scaffold Next.js (Task #5) in parallel

---

## 2026-04-21 — Session 001 continued: Masthead + pilot page shipped

**Shipped:**
- First root commit `fb46cb4` pushed to public GitHub repo `anngalante123/burgh-quarterly`.
- Apify targeted rescrape of La Gourmandine Lawrenceville by placeId — 15 reviews, 6 with text. Raw record saved at `content/raw/apify/la-gourmandine-raw.json`.
- Relay logos installed at `public/brand/relay/` and `assets/brand/`. Brand purple locked as exact `#AB35EE` from the Logo SVG (D-012 revised). Blue/cyan palette from `Colors.png` flagged as secondary; added as `--color-data-*` tokens (D-017).
- 9 user-facing components shipped via dev agent:
  `Masthead` (home + compact variants), `Colophon`, `TierBadge` (3 tier styles), `ScoreCard` (public hides composite; private shows gap-to-next-tier), `UnfairAdvantage`, `ClaimAffordance`, `SidebarCTA` (gated by `visible` prop), `OwnerFirstVisit`, `SubscribeInline`.
- Two live routes: `/` (editorial homepage) and `/business/la-gourmandine-lawrenceville` with `?claimed=true` toggle for the claimed/unclaimed states.
- Stub API route: `/api/subscribe` (validates email shape, console.logs, 200).
- All copy verbatim-matched to `EDITORIAL_VOICE.md`. Forbidden-phrase grep: zero hits. Relay placement audit: colophon + claimed-sidebar only.
- Orchestrator screenshot verification: desktop homepage, desktop business page (claimed + unclaimed), tablet all green. Mobile testing flagged as degraded locally (see GOTCHAS — Chrome `resize_window` minimum-width quirk).

**Blockers resolved this session:**
- Apify data access, pilot selection, re-scrape decision, brand token precision all closed.

**Still pending:**
- Task #9 (full claim flow + Resend wiring) — partial: subscribe form exists with stub API; Resend not yet wired; `/claim/[slug]` route not built; email verification flow not built.
- Task #11 (Vercel link + preview deploy) — next.

**Next session picks up at:**
- Commit + push agent's work
- Link Vercel, deploy preview, capture URL
- Begin Phase 2: full claim flow, Resend wiring, Underrated List editorial template

**Files touched:**
- `/Users/annamariegalante/burgh-quarterly/CLAUDE.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/MEMORY.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/DECISIONS.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/EDITORIAL_VOICE.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/SCORING_RUBRIC.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/DATA_MODEL.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/LEAD_CAPTURE.md` (created)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/DEV_LOG.md` (this file)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/GOTCHAS.md` (created, empty-seeded)
- `/Users/annamariegalante/burgh-quarterly/.claude/memory/TODO.md` (created)

---

## 2026-04-30 / 2026-05-01 — Session N: Polish pass + Underrated expansion + Claim flow

**Shipped (committed in `4dbb886` on `main`, pushed):**

*Verdict card readability*
- "Engagement rate, X% engagement" → "Post engagement / X.X%" (no doubled words)
- "Review depth" → "Review volume" (truthful — 314 reviews is volume, not depth)
- "median" eradicated from UI; rank labels now `Top of Cafes` or `#3 of 6 in Cafes`; magnitude tail uses "family typical" (D-019)
- Lighter panel backgrounds, smaller body text, dimmer comparison line (D-021)
- Removed duplicate ▲/▼ at section header

*Post cards (best-on-social)*
- Caption block + redundant "See record" CTA removed — significantly less heavy on phone
- Big headline now business name → opens `/business/[slug]` in new tab; @handle demoted to small line
- Kicker is just neighborhood (no "BY"/"ABOUT" prefix)

*Playbook*
- Removed +SENTIMENT FLOOR / +VISUAL RANK impact pills (low signal)
- Removed trailing "generic enough to respect..." reasoning leak
- Cycling spotlight + flow-line visual on desktop

*GetFeatured CTA:* "Apply for a creator" → "Get matched, free"

*Underrated List → 4 categories live*
- Existing: bakeries
- New: coffee-shops (5 entries), bars-breweries (4), restaurants (5)
- Hero paragraph parameterized per bucket (no more "pulling a tray out of the oven" on a coffee shop list)
- Handwritten editorial copy for the #1 anchor in each new bucket
- `excludeSchemaCategories` added to selection logic to prevent overlap (bakery-tagged businesses don't bleed into coffee-shops)

*Claim flow shipped (Gate 3)*
- `/claim/[slug]` server-rendered page + breadcrumb
- `components/ClaimForm.tsx` client form (name, email, free-text proof) with success + error states
- `/api/claim/route.ts` validates, persists to `content/leads/claims.jsonl`, sends confirmation to claimant + admin notification to Anna via Resend
- Manual review for v1; magic-link auto-verify is v2

*Animation pass*
- `AnimatedValue` counts AtAGlance numbers up on viewport intersection
- Ken-Burns on hero photo (30s slow zoom — wired to inline `<img>`, not the unused PhotoHero component)
- Scan-sweep on diagnosis lime highlight
- Verdict rows stagger in
- Trend pill breathes on positive buckets only
- All respect `prefers-reduced-motion`

*Prompt hygiene*
- `scripts/analyze-business.ts` prompt now forbids "median" so future regenerations match UI voice (D-019)

**Still pending:**
- Regenerate `content/analyses/*.json` to clean stale "median" references in Claude-generated narrative (~$3-5 across 30 businesses)
- Sponsor system scaffolding (D-020 — model agreed, not built)
- Filesystem writes in `/api/subscribe` and `/api/claim` will silently fail on Vercel (read-only filesystem). Lead capture survives via Resend admin emails. Wire to Supabase / Vercel Marketplace for real DB.

**Vercel env vars to set before deploy:**
- `RESEND_API_KEY` (required for any email)
- `RESEND_FROM` (default `Signal Pittsburgh <signal@run-relay.com>` — domain must be verified in Resend)
- `ADMIN_EMAIL` (default `annamarie.galante@blastpoint.com`)

**Next session picks up at:**
- Decide on lead-capture DB (Supabase recommended)
- Scaffold sponsor system per D-020
- Optionally regen analyses to clean residual "median" leaks

---

## 2026-05-07 — Phase A2 + A3: spa branch, DB-backed family pool, ingest triage

**Phase A2 (commit `0353a29`):** spa category end-to-end (enum, mapCategory regex, target, label, medians, migration `0004_many_harrier.sql`). Replaced disk-only Google-text-keyed family lookup with single source of truth in `lib/data/category-family.ts`, keyed off the typed Category enum. Family peers now sourced from DB so DB-only categories (tattoo, spa, salon) get real per-family peers. Family-leader excludes the target itself. New `/leaderboard` route (untracked-then-committed). 13 new normalize tests for spa precedence and salon-spa disambiguation. 108 tests pass.

**Phase A3 (this commit):** ingestion-pipeline triage. The 44 stuck `failed` ingest_runs broke into:
- 17 low-review failures (analyze step threw on `< 2 reviews on disk`)
- 24 JSON-output failures (Claude returned non-JSON: 7 truncated, 11 "I need to..." refusals, 6 "Looking at..." prose)
- 1 photo upload (iron-city, hidden DB error)
- 1 timeout retry exhaustion (wyomissing)
- 1 missing-disk-file (inktoxicating-tattoos)

Three changes:

1. **skipped_low_reviews ingest_status** (migration `0005_graceful_sentinels.sql`). Replaced the throw on `<2 reviews` with `checkpointWriteSkipped(slug, "analyzed", "skipped_low_reviews", msg)` plus clean return. Updated RunRow union, checkpointShouldRun prior-skip branch, and checkpointWriteSkipped signature.

2. **Tool-use forced output in `analyzeOne`**. Defined `ANALYSIS_TOOL` whose input_schema mirrors the JSON shape. Calls now pass `tools: [ANALYSIS_TOOL]` and `tool_choice: { type: "tool", name: "emit_business_analysis" }`. Pulls parsed object from `tool_use` block instead of JSON.parse on text. Trimmed redundant "Return ONLY a valid JSON object" SYSTEM_PROMPT instruction. Prompt caching preserved on system block.

3. **DB-backed slug-resume**. New `loadBusinessFromDb(slug, issueSlug)` reconstructs LegacyBusinessFile from `businesses` + `business_signals` + `business_reviews` + `business_photos` + `scores` + `business_review_keywords`. Flattens DB ranks JSONB into Zod's flat rank_category/neighborhood/overall. `stepScraped` now falls back to DB when disk JSON is missing. Required because Phase 7 batch ingest writes straight to DB and never produces per-slug JSON, so `--resume` was previously broken for any slug not in the original 30 calibration JSONs.

**Re-run results:** 44 stuck → 1 stuck. Final state: 7,922 success, 34 skipped_out_of_geo (geo filter caught Albany NY, Portland ME, Newport RI, etc. that should never have been queued), 17 skipped_low_reviews, 1 failed.

**Spend:** ~$0.50 across the re-run batch. The cache-hit rate on SYSTEM_PROMPT is high (cache_r > 0 on every successful call), so per-business analyze cost stayed in the $0.025-$0.030 band.

**Iron-city follow-up (parked):** 1 row remains failed, `iron-city-elite-fitness-and-performance` at the `photos_uploaded` step. The Drizzle wrapper swallowed the underlying Postgres error; only `Failed query: insert into "business_photos" ... params: ...,blob_key="",...` is logged. Business row + 13 photos already exist in DB, so the failure is on the FOURTEENTH photo (sort_order=12, the URL ends with `=w1920-h1080-k-no` query string). Not blocking; addresses can be debugged when next touching the photo upload path.

**Next session picks up at:**
- Run the next Phase 7 sweep (queues are populated for 18 categories, the spa queue is fresh with 200-target).
- Optional: investigate iron-city photo bug if/when the upload code is touched.
- Optional: regen analyses for the older 30 calibration businesses to clean residual "median" leaks (still in their JSON files since they predate the prompt rule).

---

## 2026-05-07 (evening) — Phase A4: business_signals backfill + page rendering recovery

**The bug Anna found:** Phase 7 batch ingest never wrote to `business_signals`. Result: 1,992 businesses had no signals row, so the page rendering for everything outside the 30 calibration originals lost the verdict card ("DOING WELL / ROOM TO RUN"), the per-row peer comparisons ("12/30d Top of Sweets"), and most of the rich-data blocks. Pleasant Bar's diagnosis line read "GOOGLE PROFILE IS STILL EMPTY" because Claude was looking at zero values when it ran analyze.

**Fix in three parts:**

1. **Schema extension (migration `0006_flimsy_thunderball.sql`).** Added 8 columns to `business_signals`: `primary_category_name`, `images_count`, `image_categories` (jsonb), `from_the_business_flags` (jsonb), `has_phone`, `has_opening_hours`, `claim_this_business`, `reviews_distribution` (jsonb). These had been living on a per-slug `_meta` JSON block that Phase 7 never wrote. Putting them in DB beats reconstructing 2K JSON files.

2. **Loader refactor.** `loadLegacyMeta` in `lib/data/load-business.ts` now takes optional pre-loaded DB rows (`signalsRow`, `bizRow`, `reviewTexts`, `keywordRows`) and source-priorities them: per-slug JSON file first (originals), then DB row (Phase 7), then synthesized fallback. The three bulk loaders (`loadBusinessBySlug`, `loadAllBusinesses`, `loadBusinessesBySlugs`) all pass DB rows through. Old callsites that just pass a Category fallback still work via a back-compat coercion. `loadBusinessBySlug` now also pulls review text rows from DB so per-page pull-quotes work for Phase 7 businesses.

3. **Pipeline fix.** `stepScrapedFromApify` in `scripts/ingest-one.ts` now upserts `business_signals` immediately after the businesses upsert. All 11 columns written from `artifact.business` + `artifact.meta`. Future Phase 7 runs do not need a backfill.

**Backfill (one-time, scripts/backfill-signals.ts).** Reads every `content/raw/apify/pit-*.json` (52 files, 5,522 records, 3,705 unique placeIds). Joins to `businesses.place_id`. Writes 1,813 new signals rows (90% of the 2,022-business index). 209 rows had no placeId match in raw dumps, mostly the 30 calibration originals (which already have JSON files) plus a few duplicate-slug edge cases. No API spend.

**Verified.** Pleasant Bar's page now renders the full verdict card: REVIEW VOLUME 497, "#29 of 157 in Bars", "more than 2x the industry typical", "Review traffic is heavy, 2.2x the volume of typical Pittsburgh peers." Family rank, breadcrumb, subhead all unchanged from the Phase A3 fix.

**Still parked:** the 1,987 existing analyses still carry diagnosis text generated when Claude saw zero data. Re-running analyze on them with `--force` would replace those lines with text that reflects real review volume, ratings, and category context. Cost is roughly $50 across the index. Anna will plan that as its own pass.

108 tests pass, clean typecheck.

**Next session picks up at:**
- Re-analyze sweep across 1,987 businesses (~$50, ~30 min) when Anna is ready.
- iron-city-elite photo upload (still 1 row stuck) when the upload path gets next touched.

---

## 2026-05-08 — Phase A5: rescore + dedup + scoreboard + sweep with caveat

**Where you sit, redesigned.** New `components/insights/PeerScoreboard.tsx` replaces the 220-row "WHERE YOU SIT" wall with a position-aware compact view. Three flavors (top-of-family, middle, bottom). Editorial sentence above the scoreboard names a specific rival when one exists. "Show all N" toggle preserves access to the full list. Reviewer-flagged accessibility fixes applied: aria-current on self row, aria-label on rival callout. Commit `7345af8`.

**Duplicate businesses cleanup.** Phase 7 ingest had created 377 duplicate rows (one with clean slug, one with `-XXXXXX` hash suffix; same place_id). Root cause: `scripts/ingest-one.ts resolveSlugForNewBusiness` checked only "does this slug exist" before suffixing, so re-ingesting the same place_id created a second row instead of updating the first. Patched the function to also check place_id; if existing slug's place_id matches, return the existing slug. Wrote `scripts/dedup-businesses.ts` to walk the 377 dup groups, pick the canonical (non-suffixed) slug, and delete the dup. Cascade FKs handle the children. Result: 2,022 to 1,645 businesses. Zero remaining dup groups. Commit `3903e3e`.

**Rescore-all (and the bug that cost a sweep).** `scripts/rescore-all.ts` recomputes subscores+composite+tier across the index using the now-populated business_signals from Phase A4. First version omitted review texts from the meta block, which silently flat-lined `communitySparkScore`'s sentiment leg at 30 for every business. Code review caught it before push. Fixed version loads `business_reviews.text` in bulk and feeds it through. Comparison:

| | Broken rescore | Fixed rescore |
|---|---:|---:|
| Staples to OTW | 4 | 895 |
| Staples to Icons | 0 | 127 |
| OTW to Icons | 4 | 20 |
| Icons drops | 147 | 2 |

Fixed-rescore tier distribution: 44 Icons / 200 OTW / 1,400 Staples. Honest, matches real-world tier shape.

**Re-analyze sweep, $52.50, partially complete.** Ran a full re-analyze sweep against the (still-broken) rescore on the first pass: 1,640 of 1,644 succeeded for $51. Smoke test on Pleasant Bar showed dramatically better diagnosis text once Claude had real signals to work with. Pushed for a second sweep against the fixed rescore. Anthropic API credit ran out at iteration 86. Only ~85 businesses got refreshed against the corrected scores; the remaining 1,559 still carry the diagnosis text generated against the broken-rescore family ranks. Mostly minor (editorial commentary survives; rank-citation numbers in some lines are stale).

**The stuck spot:** site renders consistently with proper tiers and signals. Diagnosis text is good for ~85 businesses on the fixed rescore plus all 30 calibration originals; the other ~1,500 carry slightly-stale rank citations. The pages still look correct because PeerScoreboard and family-rank rendering compute on the fly from current scores, so the rank shown next to "you are here" is always fresh. The staleness is only in Claude's editorial copy.

**Next session picks up at:**
- **Top up Anthropic credits**, then run `scripts/reanalyze-all.sh` again to refresh diagnosis text on the remaining ~1,559 businesses against the fixed rescore. Estimated cost: another ~$45.
- Investigate whether the iron-city-elite photo-upload bug should ship as a fix or stay parked.
- Optional follow-ups from reviewer notes: tighten dedup `SUFFIX_RE` to require at least one digit (currently false-positive-prone for legit slugs ending in 6 alpha chars; didn't bite this run because no dup-group contained one); guard PeerScoreboard for total<6 family sizes.

---

## 2026-05-08 to 2026-05-09 — Phase B: index expansion + sub-category peers + new "where you sit" visual

**Index expansion.** Sequenced 4 categories (restaurant, cafe, bar, fitness) through Apify Google Maps Scraper with neighborhood-split and sub-type-split queries, then ingested via `ingest-one --batch`. Apify returned ~12,000 raw places, the existing chain/geo filters dropped about 60% as out-of-Pittsburgh or chain, ~3,700 net new place_ids landed in queues. The first sequential ingest was running at ~40/hr because Apify per-place start-up dominates; switched to four parallel `--batch` processes and the rate held while wall time dropped to 2-3 hours. 1,579 ingests succeeded, 0 failures. **DB grew from 1,657 to 2,910 businesses.** Tier distribution honest: 142 Icons / 1,133 Ones to Watch / 1,634 Neighborhood Staples. Total Apify spend tonight ~$50; total Anthropic spend tonight ~$70. Anthropic credit ran out twice mid-session and Anna topped up.

**One slug-resolver finding.** Found the polling bug in `scripts/scrape-and-queue-category.ts` (it reads `run.stats.itemCount` which Apify never returns; `items=0` was misleading the operator while the actual scrape was running). Logged but not fixed in this session because the script's wait-loop terminates on run-status anyway, so the misleading log was cosmetic. Wrote `scripts/harvest-apify-run.ts` as a side-channel that fetches a dataset by run id when the local script is killed mid-flight.

**Sub-category peer scoping.** The "WHERE YOU SIT" section previously compared every business against the entire family (Pittsburgh Restaurants = 600+ peers, Pittsburgh Boutiques = 69 peers). The dot strip overlapped its own labels at any N greater than ~15 and the comparisons were editorially meaningless (a vintage boutique vs a sporting-goods store). New `lib/data/sub-category-peers.ts` picks "true peers" via Apify `primary_category_name` with a layered fallback:

  1. STRICT same primary_category_name (e.g. all 49 "Italian restaurant" peers)
  2. RELATED expand by significant-word overlap within family if strict pool is below 5
  3. FAMILY full family fallback otherwise

Wired into `lib/editorial/family-stats.ts` (medians and ranks), and into `app/business/[slug]/page.tsx` (`computePeerMedians` and `buildCategoryPeerDots`). Headers now read "RANK IN ITALIAN RESTAURANTS, #20 of 56" and the editorial sentence references the sub-category by name.

**TierProportionBar component.** Replaced the per-business dot strip with a single proportional 3-zone bar (lime Icons, purple Ones to Watch, cream Staples) sized to actual tier counts, with one YOU marker. Counts and tier names live in a single legend row beneath the bar so narrow zones never truncate. Reader gets two facts at one glance: the family's tier shape, and where they sit. Plays well at any N from 5 to 600+. Located at `components/insights/TierProportionBar.tsx`.

**PeerDotPlot rewrite.** The component is now a thin 80-line wrapper around TierProportionBar + PeerScoreboard. Old version had ~460 lines of dot-rendering, hover state, popovers, motion stagger, sub-components (Dot, PeerPopover, LegendDot) and a duplicate tier legend. All dropped. Imports of `motion`, `AnimatePresence`, `useReducedMotion`, `useState`, `useRef`, `useEffect`, `Link` removed too.

**Code review.** Two-agent parallel review on each major change. One real bug caught and fixed before commit each time:
- Phase B reviewer 1 caught dead code in PeerDotPlot.tsx (~300 lines) and a stale "Each dot is a business" caption that no longer matched the new visual.
- Reviewer 2 caught an em dash in family-stats.ts:69 ("Avoid the word 'median' — it's jargon"). Single-character fix for Anna's hard rule.

Verified live across multiple business pages (Italian restaurants, fitness, etc.). 108 unit tests pass, clean typecheck.

**Tonight's parked items:**
- ~1,559 businesses with stale-rank analyses from earlier in the session. Refresh costs ~$45 when Anna decides.
- iron-city-elite photo-upload bug (still 1 row stuck).
- Reviewer suggestions parked: page-level scope memoization (3x peer-scope calls per page render), aria-current on the YOU marker, subtle reveal animation on the YOU arrow.

**Net session result:** index nearly doubled (1,657 → 2,910), tier comparisons now editorially meaningful (sub-category peer pools), main visualization replaced with a clean proportional bar, ~$140 total spend across both Apify and Anthropic.

---

## 2026-06-02: Data-quality cleanup pass (model leak, five-star vintage, family labels) + stale-analysis tool

**Context reconciliation.** The session brief and SCALE_PLAN.md (2026-05-01) described a 30-business JSON POC. The repo is a month past that: Neon DB, full pipeline, ~2,580 businesses (2,579 scored: 242 Icons / 1,448 Ones to Watch / 889 Staples) across 21 categories. Two flagged debts were already fixed: category 404s/mistagging (#9, all categories populated, no 404s) and the homepage Icons clamp (#14, homepage computes the count live from DB). Anna chose to fix the remaining live data-quality debt and to fold the 30 curated businesses fully into the index (no separate Featured Picks surface).

**Shipped on branch `fix/data-quality-cleanup`, commit `b595294` (pushed):**
- **Model-field leak (#12) closed.** `analyses.model` ("claude-sonnet-4-6") was being serialized into the RSC payload on ~2,566 business pages via the ReviewVoice client prop (confirmed by curl). Fixed at the loader: `loadReviewAnalysis` / `loadAllReviewAnalyses` no longer return `model`. DB column kept for cost audit; migrate-json-to-db re-typed to keep writing it. Removed 2 static model leaks in content JSON. Verified: grep for claude-sonnet returns 0 on business pages.
- **Five-star percentage vintage (#11) fixed + 30 folded.** The five-star % divided a stale legacy-JSON numerator by the fresh DB total. Now the business page divides by the same distribution's own sum (DB `business_signals.reviews_distribution` when present, JSON fallback for the 7 nulls), so the ratio is self-consistent. 23 of 30 legacy businesses moved onto DB data. Page's renders 3,153 reviews / 87% five-star, self-consistent. Non-legacy pages provably unchanged (distTotal === totalRev). Fixed 2 article descriptors that contradicted their own stat_line (3,145 -> 3,153).
- **Family-label drift (#10) unified.** `components/list/ListItem.tsx` retired its substring-override hack and now derives the family label from canonical `familyForBusinessCategory(category)`, matching every business page. Butterwood reads "Pittsburgh Sweets" (was "Pittsburgh Cafes"). Side effect Anna approved: 12 Asian-themed-article rows now read "Pittsburgh Restaurants" (their canonical family); kept canonical, article titles still carry the theme.

Verified: 123/123 unit tests, tsc clean, zero lint issues in the 5 touched files (15 pre-existing lint errors live in other files), homepage + business + list pages render.

**Built but NOT run: `scripts/refresh-stale-analyses.ts`.** No batch stale refresher existed (the `reanalyze-all.sh` named in earlier logs does not exist). New tool reuses backfill-missing-analyses internals (exported `processSlug` etc.), targets STALE rows (`analyses.generated_at < scores.scored_at`), supports `--tier`, `--limit`, `--cost-ceiling`, `--force` (required: ~1,285 rows sit behind success checkpoints), and is DRY-RUN by default (`--execute` required to spend). Dry-run confirms **true stale count = 2,545** (239 icons / 1,434 OTW / 872 staples), not the ~1,559 in older notes (a 2nd full rescore on 05-13 re-staled everything). Cheaper-first icons+OTW subset = 1,673 rows ~ $33.46; full pass ~ $50.90.

**Parked / next session:**
- **WIP on branch `wip/social-ingest-checkpoint-2026-06-02` (commit `66028ab`).** ~1,938 uncommitted files (a content/social ingest, +22k-line handles.json) plus mid-edit scoring (score.ts, rescore-all.ts, compute-ranks.ts, business-tldr.ts) were parked here so this cleanup started from a clean tree. Recover with `git switch wip/social-ingest-checkpoint-2026-06-02`. NOT pushed.
- **Run the stale-analysis refresh AFTER the scoring WIP is committed and a rescore lands** (otherwise it re-stales). Then snapshot the analyses table, run `npx tsx scripts/refresh-stale-analyses.ts --tier=icons,ones_to_watch --force --execute` (~$33), then staples.
- **Flags surfaced, not fixed:** (1) Page's DB diagnosis_pullquote still reads "FIRST IN PITTSBURGH BOUTIQUES ON 3,145 REVIEWS" (stale category + number, fixed by the refresh run). (2) Verdict card says "FAMILY TYPICAL" where D-022 wants "industry" (user-facing), a spot D-022 missed. (3) Hero photos render as empty boxes in local dev (remote Google image URLs not loading). (4) 15 pre-existing lint errors in app/category, app/page, app/top, app/underrated, and scripts. (5) Pre-existing em dashes in code comments (e.g. load-business.ts) violate the hard rule; a repo-wide sweep was not done (Anna says sweep only when asked).
