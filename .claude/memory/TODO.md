# TODO

Single source of truth for next-session work. Session 001 lands with Phase 1 partially done — scaffold is in, app is not.

---

## Blocking (needs Anna)

- [ ] **Pick pilot from shortlist** (DECISIONS.md D-016). Top pick: La Gourmandine Lawrenceville. Takes 5 seconds — which one calibrates against your gut best?
- [ ] Confirm working name ("The Burgh Quarterly") or pick a final
- [ ] Confirm repo should be **public** on GitHub
- [ ] **Decide on re-scrape with `maxReviews: 10–20`** (adds sentiment-bearing review text — see GOTCHAS / DECISIONS D-015). Cost ~$30–150 for full re-scrape; deferring gracefully degrades sentiment signals but doesn't block MVP.

## New — Data ingestion (unblocked)

- [ ] Write `scripts/ingest-apify.ts` — loops Apify tasks, downloads datasets to `content/raw/apify/`, caches latest dataset ID per task
- [ ] Write `lib/data/normalize.ts` — transforms Apify Google Maps record → our Business schema (Zod-validated)
- [ ] Dedupe across overlapping tasks (same `placeId` may appear in multiple tasks — canonical by `placeId`)
- [ ] Add Instagram scraper enrichment — she already has `instagram-scraper` and `instagram-scraper---clay` tasks in the Apify workspace; plumb those in for Momentum scoring

## Phase 1 remaining (unblocked — can start now)

- [ ] Scaffold Next.js 16 app (`npx create-next-app` with TS + Tailwind v4 + App Router)
- [ ] `npx shadcn@latest init` — configure with Relay brand tokens
- [ ] Install deps: `zod`, `react-hook-form`, `@hookform/resolvers`, `resend`, `react-email`
- [ ] Configure Tailwind v4 theme with brand tokens (see DECISIONS.md D-012)
- [ ] Load Unbounded + DM Sans via `next/font/google`
- [ ] Write Zod schemas in `lib/data/schemas.ts` (see DATA_MODEL.md)
- [ ] Create repo `anngalante123/burgh-quarterly` (public) and push initial commit

## Phase 1 blocked (needs pilot business)

- [ ] **Delegate:** build masthead + homepage + business page template (depends on pilot business for calibration)
- [ ] **Delegate:** build subscribe form + claim form with Resend wiring

## Phase 1 close-out

- [ ] Link Vercel project, deploy preview
- [ ] Orchestrator verification pass: screenshot desktop + mobile + tablet, verify brand tokens render correctly, zero console errors
- [ ] First-session checkpoint with Anna — present preview URL + QA summary

## Phase 2 — The First Issue (after Phase 1 ships)

- [ ] 20 businesses across 3 verticals (coffee, salons, fitness), hand-enriched
- [ ] Calibrate rubric against Anna's gut on 3–5 businesses
- [ ] Homepage with current issue teaser
- [ ] One Underrated List editorial piece drafted (Anna's voice, Claude polishes)
- [ ] Lead capture wired to Resend + JSONL lead file

## Phase 3 — The Drop (weeks 3–4)

- [ ] Domain registration (after name locks)
- [ ] SSL + production deploy
- [ ] Subscribe confirmation email template
- [ ] "Spring 2026" issue published
- [ ] Open Graph share cards for every business page
- [ ] Seed ~100 businesses

## Phase 4 — Automate (post-POC)

- [ ] Apify scrapers (Google Maps + Instagram)
- [ ] Website crawler
- [ ] Claude API scoring pipeline
- [ ] Claude-assisted editorial drafting
- [ ] Movement alert system
- [ ] Expand to 300+ businesses, 6 verticals

---

## 2026-05-01 update — most of Phase 1 + Phase 2 shipped

The TODO above is partly stale; here's the current punch list.

### Done (commit `4dbb886`)
- Underrated List × 4 categories live (bakeries / coffee-shops / bars-breweries / restaurants)
- Claim flow shipped (`/claim/[slug]` + `/api/claim` + Resend wiring)
- Subscribe wired to `/api/subscribe` + Resend
- Verdict card readability pass (D-019, D-021)
- Post-card simplification on best-on-social
- Animation pass (Ken-Burns, scan-sweep, verdict stagger, trend breathe, animated counters)

### Open

- [ ] **Lead-capture DB.** `/api/subscribe` and `/api/claim` write to `content/leads/*.jsonl` which silently fails on Vercel's read-only filesystem. Options: (1) rely on Resend admin emails as the lead log (no code), (2) wire Supabase via Vercel Marketplace (~30 min), (3) push subscribers to a Resend Audience.
- [ ] **Sponsor system (D-020).** Approach agreed; not yet built. JSON schema + `<SponsorSlot />` component + 2–3 tier model, never on `/business/[slug]`.
- [ ] **Regenerate analyses** to clean residual "median" leaks in Claude-generated narrative (~$3-5 across 30 businesses with current prompt update).
- [ ] **Vercel env vars before deploy:** `RESEND_API_KEY` (required), `RESEND_FROM` (optional, domain must be verified), `ADMIN_EMAIL` (optional).
- [ ] **Magic-link auto-verify for claim flow.** v1 is manual review by Anna. v2 graduates per `LEAD_CAPTURE.md`.

---

## 2026-06-02: Data-quality cleanup (shipped on `fix/data-quality-cleanup`, commit `b595294`, pushed)

Reality check first: the index is ~2,580 businesses on Neon (2,579 scored: 242 Icons / 1,448 OTW / 889 Staples), not 30. See DEV_LOG 2026-06-02 for full detail.

Resolved this session:
- [x] **Model-field leak (#12).** `analyses.model` no longer reaches the browser (was leaking on ~2,566 pages via ReviewVoice). Fixed at the loader.
- [x] **Five-star % vintage + fold the 30 (#11).** Five-star ratio now self-consistent (same DB vintage for numerator + denominator). 2 article descriptor contradictions fixed.
- [x] **Family-label drift (#10).** ListItem derives family label from canonical category; substring hack retired. Butterwood reads "Pittsburgh Sweets".
- [x] **Category 404s (#9) and homepage Icons clamp (#14):** verified already fixed, no change needed.

Still open:
- [x] **Stale-analysis refresh: DONE 2026-06-05/06.** 2,515 writeups regenerated, $42.20 true spend. (Was listed as open here; see memory/DEV_LOG for the in-between sessions.)
- [x] **Social-ingest WIP: MERGED to main 2026-06-03** (squash commit `f6a52d8`), live rescore applied (28 score changes, 3 tier moves).
- [ ] **D-022 gap:** verdict card shows "FAMILY TYPICAL"; user-facing copy should say "industry". Quick sweep in SubscoreBars/verdict-copy.
- [ ] Pre-existing: 15 lint errors in app/category, app/page, app/top, app/underrated + scripts; hero photos not loading in local dev; em dashes in some code comments (sweep when asked).


---

## 2026-06-10: Issue 02 lists shipped (PR #2 squash-merged, deployed, verified live)

- **Live:** /best-on-social/most-creative-posts (top 10 of 759 vision-scored own IG posts) and /best-on-social/unexpectedly-viral-moments (lift over own median; 7 own-post + 3 creator-filmed mention moments behind a Haiku relevance gate at temperature 0 with HUMAN_REJECTED_MENTIONS pinned video ids).
- **Placeholder:** /best-on-social/defended-in-the-comments ("This list is being reported"). IG comment scout across 22 beloved businesses found ~no defense threads (memo: scripts/output/defense-curation-memo.md, gitignored). Defense evidence lives on Reddit/FB/review replies, not IG.
- **Data:** own IG posts scraped for top-250 pool; TikTok mentions 30 -> 258 businesses (107 with videos). lib/lists/own-posts-pool.ts = shared franchise/institution exclusions + shared-handle dedupe for all small-business lists.
- **New rules:** article intros are ONE paragraph, 80-120 words (Anna). Posts articles support rank_label + method_note (rendered in the methodology box). Empty business lists render a reported-not-generated note.
- **Deploy gotchas:** .vercelignore now required (content/raw hit ~420MB and uploads 500'd); a deployment stuck "Initializing" poisons retries via dedupe, fix with `vercel --prod --force`. Zombie 06-10 deployment still listed in dashboard, delete manually.
- **Costs:** ~$72.5 total. clockworks~tiktok-scraper measures ~$0.22/business (40x the old header estimate); full catalog ~$560, NOT run.

Open next:
- [ ] Defense list content: Anna curates from evidence, or scout Reddit/review-replies next quarter.
- [ ] Summer issue: decide if TikTok creator coverage joins the composite (rubric change + recalibration + rescore under NEW issue_slug 2026-summer).
- [ ] feat/issue-02-lists branch still on GitHub (ask Anna before deleting).

---

## 2026-06-12: Batch 1 audit fixes shipped (see DEV_LOG same date)

Done: chain blocklist +5 with row removal, engagement sanitizer + rescore (763 updates / 75 tier shifts, Anna approved), geo backfill (1,553 coords, 671 neighborhoods), 29 wrong-IG attributions nulled, 1 dup row deleted. DB now 2,574 businesses.

Open (Batch 2, scraper + enrichment session):
- [ ] More chains in index: Benihana, The Capital Grille surfaced in top-5 restaurants post-rescore. Add to blocklist + remove; consider the audit's follower-ceiling heuristic routing high-follower unknowns to needs_review.
- [ ] Remaining 512 generic "Pittsburgh" neighborhoods: mostly USPS-Pittsburgh suburbs OUTSIDE city limits. Fix = Allegheny County municipal boundaries GeoJSON (WPRDC) point-in-polygon; ~316 have coords now. Needs download approval.
- [ ] posts_30d true 30-day count (scrape fetches only ~12 posts; 355 accounts saturate at 12). Scraper change + re-scrape on ONE schedule; store scraped_at per record, compute dormancy against it.
- [ ] Review-depth pilot (claim 6): we store max 20 review texts/business; Page's has 3,153 on Google, 0 stored. Pilot 10 businesses on Apify, check usageTotalUsd, THEN decide batch. Also business_review_keywords only covers 17 slugs.
- [ ] house-of-shish-kebabs vs uzbek-food: same address (1926 Spring Garden Ave), likely one kitchen/two listings. Needs Anna judgment or phone call (like Al's Fish cluster).
- [ ] Multi-location brand modeling (La Gourmandine x4 etc.): rows kept deliberately; lists dedupe by handle via own-posts-pool.ts. Decide at summer issue whether to model locations under one business.
