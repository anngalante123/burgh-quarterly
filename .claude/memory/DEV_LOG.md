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
