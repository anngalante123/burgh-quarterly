# Scale Plan (2026-05-01)

> **STATUS UPDATE 2026-06-02.** This plan is largely SHIPPED and is kept for history. The index is on Neon Postgres at ~2,580 businesses (2,579 scored: 242 Icons / 1,448 Ones to Watch / 889 Staples) across all 21 categories, not 30. Phases 1 (schema + migrate-json-to-db) and 2 (single-business pipeline: ingest-one, analyze-business, rescore-all) are DONE. Phase 3-4 partly done: restaurant, cafe, bar, fitness swept plus the curated set; still un-swept categories include tattoo, spa, distillery, yoga/Pilates, gallery/museum, specialty grocery, ice cream, fast-casual. Phase 5 (/category/[slug]) and 6 (/leaderboard, /top) are built. Phase 7 (quarterly refresh cron) is NOT built. "Firecast" branding was retired and the publication was renamed "Signal Pittsburgh" on 2026-05-12. Treat references to "Firecast" and "30 businesses" below as historical.

**Goal:** grow the index from 30 hand-picked Pittsburgh businesses to roughly 3,000 to 5,000 across Pittsburgh + Washington County, keeping the same depth (Firecast scoring, narrative, playbook, peer comparison, photos, tier badge) for every business.

The original 30 was a scope-of-work scaffolding starter, NOT the editorial premise. The premise was always a comprehensive ranking. Treat all "Issue 01 covers 30 businesses" copy as legacy that will need rewriting once volume lands.

---

## Geography

- **Pittsburgh proper** (Allegheny County, mostly the city itself plus inner-ring neighborhoods)
- **Washington County, PA** (smaller, more rural, expect 500 to 1,000 qualifying businesses)
- Wider expansion (Allegheny County full, Western PA, etc.) is out of scope for this phase.

---

## Categories (locked 2026-05-01)

Anna's explicit yes list:

### Food & drink
- Restaurants (the broad "food" bucket, may split later by cuisine or vibe)
- Bakeries (already partly shipped)
- Coffee shops + cafes (already partly shipped)
- Fast-casual / fresh-healthy (juice bars, salad shops, smoothies, bowls)
- Ice cream + frozen dessert
- Bars (already partly shipped)
- Breweries (already partly shipped)
- Distilleries

### Wellness + experience
- Spas (NOT salons, NOT nail salons, NOT barbers)
- Tattoo studios
- Yoga + Pilates + fitness studios
- Galleries + small museums

### Specialty retail
- Specialty grocery (butchers, cheese shops, ethnic markets, dedicated bottle shops)

### Explicitly OUT
- Barbershops
- Hair salons
- Nail salons
- Big-box, chains, franchises
- B2B services (accountants, lawyers, contractors)
- Auto / mechanic

### Open questions to confirm in next session
Anna did not directly address these. Bring them up before locking the final list:
- Boutiques + vintage / thrift
- Plant shops
- Bookstores + record stores
- Florists
- Live music venues
- Wine bars (might already fall under bars or breweries)
- Cocktail bars (same question)

---

## Tier model: three layers

1. **Tier badge per category.** Icons of [Category], Ones to Watch in [Category], Neighborhood Staples in [Category]. The scarcity that makes "Icons" mean something stays intact because it is scoped to the category.
2. **Per-category leaderboard.** Top 10 Bakeries, Top 10 Coffee Shops, Top 10 Tattoo Studios, etc. This is the natural reading product for visitors who want depth in one vertical.
3. **Global Firecast leaderboard.** A property-wide top N (probably 30, 100, 250) across every category. Same scoring, just pooled.

Existing tier labels stay (Icons, Ones to Watch, Neighborhood Staples). Existing Firecast scoring rubric stays. Visual treatment stays (lime + purple + newsprint).

---

## Architecture moves required

These are not optional once we cross a few hundred businesses.

1. **Move from JSON files to DB.** `content/businesses/*.json` works for 30. At 5,000 it makes the build crawl and writes are not concurrency-safe. Use Neon Postgres on Vercel Marketplace. Likely free tier first, paid (~$20/mo) after we cross thresholds.
2. **Switch business pages to ISR.** Building 5,000 static routes per deploy is expensive. ISR renders on first hit and caches, only the homepage and category pages stay fully static.
3. **Image storage.** 5,000 businesses × ~10 photos each = 50,000 images. Vercel Blob storage (~$0.023/GB/mo). Compressed JPEGs at reasonable sizes likely 5 to 15 GB total. Probably under $10/mo.
4. **Batch ingestion pipeline.** A single script that takes a category + geography input, runs the full pipeline (Apify scrape, score, narrate, store), and reports progress. Resumable (so a mid-run failure does not waste API spend).
5. **Editorial review gates.** Anna can no longer eyeball every business. The pipeline should produce a "needs review" queue (low confidence narrative, banned-word leaks, image quality issues) and auto-approve everything else.

---

## Cost ceiling

Realistic, with Sonnet 4.6 + prompt caching:

| Step | Per business | × 5,030 |
|---|---|---|
| Apify Google Maps (place + reviews + photos) | $0.02 to $0.04 | $100 to $200 |
| Apify Instagram momentum | $0.005 to $0.01 | $30 to $50 |
| Claude Sonnet (narrative + playbook + peer, cached system prompt) | $0.06 to $0.12 | $300 to $600 |
| **First-pass total** | **~$0.10 to $0.17** | **~$500 to $850** |

Quarterly refresh: $150 to $400 (only re-score businesses with new review velocity, IG cadence shifts, or score band changes). Full re-score every 4 quarters: another $500 to $850.

**Annual run rate: roughly $1,100 to $2,500 in API spend.**

---

## What was just shipped (2026-05-01, before this scale plan)

Recent commits, see `git log --oneline -10`:
- `b10b07f` Add /request profile flow and self-contained hero search
- `f3af9f0` Soften business-page CTA copy: drop "cheap next move" and "leverage" line
- `7bfe8fc` CTA button: "Apply on Relay" then "Get matched"
- `280e42d` Memory: ban em dashes everywhere on the property

The /request route is now the front-door for unranked business owners. Once 5,000+ are in the index, /request remains the door for businesses we missed and for new openings between quarterly refreshes.

---

## Phased rollout (proposed order, confirm in next session)

1. **Schema design.** Map current JSON shape to Postgres tables. Migrate the existing 30 first as a proof of round-trip.
2. **Pipeline scaffolding.** Single-business end-to-end script (input: place_id, output: fully scored DB row). Run on the existing 30 to confirm parity.
3. **Apify category sweep, one category at a time.** Start with one well-defined category (probably tattoo studios, since it is bounded and not currently shipped). Run end-to-end. Review the queue. Fix prompt leaks before scaling.
4. **Batch all locked categories.** Once one category looks right, run the rest in parallel batches with a budget cap.
5. **UI for category leaderboards.** New routes (`/category/[slug]`) showing Top 10 + tier bands + the rest of that vertical's roster.
6. **Global leaderboard refresh.** Recompute the global top N across all 5,000.
7. **Refresh cadence.** Cron job or Vercel scheduled function that picks up changed businesses each quarter.

---

## Editorial premise rewrite

The "Issue 01 covers 30 businesses" copy on the homepage, /request, /underrated, and the email confirmation will all need rewriting. Likely shift to "Pittsburgh's most-talked-about businesses, ranked every quarter" with an explicit count that updates with each refresh.

This is a copy pass after the data is in, not before. Do not rewrite editorial framing speculatively.
