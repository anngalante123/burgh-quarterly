# Decisions

ADR-lite. Each decision: what, why, when. Never re-debate without updating here.

---

## D-001 — Publication model, not lead magnet
**Date:** 2026-04-21
**What:** Build a quarterly editorial property where Relay is the publisher, not the subject. Business owners must see genuine value on its own — something they check, share, claim, climb.
**Why:** A lead-magnet framing bleeds trust with operator-audience Pittsburgh owners. A publication earns repeat attention and produces reusable editorial as a side effect.
**Supersedes:** Initial "Pittsburgh Creator Readiness Report" framing.

## D-002 — Quarterly cadence
**Date:** 2026-04-21
**What:** 4 issues per year (Spring, Summer, Fall, Winter). Not weekly, not monthly.
**Why:** Quarterly is a *drop* (Michelin-style). Weekly is a chore. Less operational load, more prestige, each issue is an event.

## D-003 — Working name: The Burgh Quarterly
**Date:** 2026-04-21
**What:** Using "The Burgh Quarterly" as the working name. Alternates still in play: *The Signal*, *Word of Mouth*, *Three Rivers Index*, *Covered.*, *The Record*, *Allegheny Register*.
**Why:** Evergreen, publication-feel, no theme lock. Find-replace is cheap — Anna can swap when she locks a final.

## D-004 — Tier labels
**Date:** 2026-04-21
**What:** Three tiers:
- **Icons of the Burgh** (80–100)
- **Ones to Watch** (60–79)
- **Neighborhood Staples** (<60)
**Why:** Every tier flatters. "Neighborhood Staple" is a compliment (rooted, beloved) — no business lands in the bottom and feels insulted. "Icons" top tier pre-existed on Anna's design canvas.

## D-005 — The Underrated List is the low-tier conversion engine
**Date:** 2026-04-21
**What:** Each quarterly issue includes recurring "Pittsburgh's Most Underrated [Category]" features spotlighting Staples-tier businesses that outperform their rank on specific signals (review sentiment, loyalty, "feels like family" language).
**Why:** Being on the Underrated List is a compliment. It rewards exactly the segment Relay most needs to convert — without calling anyone's baby ugly. Hands Relay its built-in narrative: "we find underrated businesses and help the city notice them."

## D-006 — Loud editorial / quiet record architecture
**Date:** 2026-04-21
**What:** Editorial features (climber stories, Underrated Lists, neighborhood guides) have strong voice. Business pages (the scorecard zone) stay Wikipedia-neutral.
**Why:** The asymmetry is what makes the property work. A scorecard that read as editorial would feel like a verdict. A record that reads neutrally lets the editorial be opinionated without compromising credibility.

## D-007 — Relay mentions are strictly bounded
**Date:** 2026-04-21
**What:** Relay appears in exactly two places: (1) masthead colophon ("Published by Relay. Pittsburgh, PA.") and (2) one sidebar CTA on *claimed* business pages. Never inside editorial articles. Creators inside articles are named by @handle — readers infer the Relay connection.
**Why:** Editorial independence is the whole game. The moment Relay shows up in a feature, the entire property becomes an ad.

## D-008 — Private/public page split
**Date:** 2026-04-21
**What:** Public business pages show flattering data only (rank, movement, unfair advantages). When an owner claims their page, a private *Opportunities* view unlocks — that's where candid weakness diagnoses live. Relay's sidebar CTA lives only in the private view.
**Why:** Public pages can never embarrass the owner. Private candor is opt-in. Trust is earned via claim.

## D-009 — 3-tier lead gate
**Date:** 2026-04-21
**What:** Public / email-gate / claim-gate. Public = homepage, top-10 per category, business pages. Email gate = Underrated List, movement tracker, archive (subscribe framing). Claim gate = Opportunities view, edit, alerts, Relay CTA.
**Why:** Escalating value matches escalating friction. Every gate is framed as a subscribe-to-publication moment, never a "unlock your rankings" paywall.

## D-010 — Stack: Next.js 16 + Tailwind v4 + shadcn + Vercel
**Date:** 2026-04-21
**What:** Matches Anna's liftingdiarycourse stack (she knows it). shadcn/ui for components. Vercel for hosting.
**Why:** Familiar stack, strong primitives, Anna has Vercel + shadcn skills installed.

## D-011 — POC data storage: JSON files
**Date:** 2026-04-21
**What:** Business records as JSON files in `content/businesses/*.json`. No DB until lead capture needs it.
**Why:** POC-appropriate. Lazy-add Neon (via Vercel Marketplace) when lead forms go live.

## D-012 — Brand tokens (Relay brand kit) — REVISED with exact values
**Date:** 2026-04-21 (revised same day)
**Sources:**
- Purple: sourced from `Relay Logo_Square.svg` fill attribute (`fill="#AB35EE"`) — authoritative
- Lime/Off-white/Cream/Black/Unbounded/DM Sans: sourced from Relay brand kit screenshot (Concept 1: Bold, Playful, Trendy)
**What (exact):**
- Purple `#AB35EE` (primary accent) — EXACT from logo
- Lime `#C6F432` (highlight blocks, hover, score peaks)
- Black `#0F0F0F` (display type, primary text)
- Off-white `#F5F0FA` (page background)
- Cream `#F5F8E8` (section backgrounds)
- Display font: Unbounded (Google Fonts)
- Body font: DM Sans (Google Fonts)
**Why the revision:** Initial #A855F7 was a close visual guess. Reading the Logo SVG revealed the exact brand purple is #AB35EE. All CSS tokens updated.

## D-017 — Blue/cyan palette from Colors.png — flagged as secondary
**Date:** 2026-04-21
**What:** `/Users/annamariegalante/Downloads/Relay_Marketing/Logos_and_Design/Colors.png` shows a distinct palette: `#209AFF, #ABB5FE, #01EFFF, #000000, #FFFFFF, #0EB2E8`. None match the primary purple+lime direction.
**Interpretation:** The primary brand (logo + brand kit screenshot) is purple+lime. The blue palette is either legacy, an alternate concept that wasn't selected, or a secondary palette intended for specific use cases (data visualizations, charts, secondary surfaces).
**Decision:** Keep primary purple+lime for all brand touchpoints. Define the blues as `--color-data-*` tokens in CSS — unused in MVP but available for future chart/dashboard use. This preserves them without polluting the primary brand.
**Follow-up:** Ask Anna to confirm the role of the blue palette when she has bandwidth. If it's simply outdated, remove `--color-data-*` tokens and delete Colors.png reference.

## D-018 — Logos installed
**Date:** 2026-04-21
**What:** Relay logo assets copied to:
- `public/brand/relay/relay-logo-square.svg` (1KB, inline-able, purple fill `#AB35EE`)
- `public/brand/relay/relay-logo-horizontal.jpg` (113KB, for wider footprint uses)
- Mirrored to `assets/brand/` as off-server reference copy.
**Why:** Source of truth for any masthead, footer, favicon, or colophon reference. The square SVG is small enough to inline; use horizontal jpg sparingly due to size.

## D-013 — No internal articles name Relay
**Date:** 2026-04-21
**What:** Reinforces D-007. Inside features, cite creators by @handle + measurable outcome. Readers connect dots via the colophon. Only exception: if an owner quotes Relay by name in an interview, that's reporting, not placement.
**Why:** Editorial integrity. Readers smell placement instantly.

---

## D-014 — Data source locked: Apify Google Maps Scraper
**Date:** 2026-04-21
**What:** Business data ingested from Anna's existing Apify workspace. Actor: `compass/crawler-google-places` ("Google Maps Scraper"). 56 Pittsburgh tasks organized as `pit-<scraper-slice>-<vertical>`. Task names are operational slicing — *not* neighborhood filters. Records are normalized by each business's own `neighborhood` field.
**Verticals observed in task names:** `foodhv` (food high-value), `foodbars` (food+bars), `foodniche` (specialty food incl. bakeries), `saloncore` (salon/barber/beauty), `retail-experiential` (boutiques, gyms, indie retail), `travel-leisure`, `arts-culture`
**Volume:** ~100–400 items per task. Expect 2,000–5,000 unique Pittsburgh businesses after dedupe across tasks.
**Freshness:** Most recent runs on 2025-12-19 and 2026-04-20.
**Fields per record:** 55. Core fields: `title, categoryName, neighborhood, address, totalScore, reviewsCount, reviewsDistribution, imagesCount, website, phone, claimThisBusiness, temporarilyClosed, permanentlyClosed, location (lat/lng), placeId, categories, additionalInfo (Black-owned / Small business / Latino-owned / etc.)`
**Why:** Anna already invested in this pipeline. Data is fresh, deep, and professionally organized. Avoids duplicate spend.

## D-015 — Known data gap: review TEXT not scraped
**Date:** 2026-04-21
**What:** Current Apify runs have `reviews: null` — only counts and star distributions are scraped, not the review text itself.
**Impact:** Sentiment-based signals (keyword mentions like "feels like family," review-phrase clustering, "unfair advantages" derived from reviewer language) cannot be fully computed yet. Community Spark and Collab Fit subscores degrade.
**Mitigation for MVP:** Score from available signals only. Re-run scraper with `maxReviews: 10–20` on priority tasks before final publication.
**Re-scrape cost:** ~$0.01–0.03/business at Apify default pricing. ~$30–150 total for a full re-scrape.

## D-016 — Pilot business shortlist
**Date:** 2026-04-21
**Top candidates (all open, 4.6+★, 100+ reviews, 50+ photos, independent):**
- **La Gourmandine Lawrenceville** — bakery, 4.8★, 1289 rev, 775 img — my top pick (Pittsburgh-icon category, Lawrenceville = Instagram-central, photogenic product)
- **Gaucho Parrilla Argentina** — Downtown, 4.6★, 4293 rev, 3604 img — known to every Pittsburgher, fastest gut-check
- **Wildcard Lawrenceville** — gift shop, 4.9★, 439 rev — beloved indie retail
- **Page's (Arlington)** — dessert shop, 4.8★, 3112 rev — "underrated gem" narrative built in
- **Style & Grace Barbershop** — 4.8★, 467 rev — smaller scale, more representative of Relay's target segment
**Decision:** Awaiting Anna's pick. Default to La Gourmandine if no response.

---

## Open (awaiting decision)

- **Final name** — using "The Burgh Quarterly" as working. Alternates live.
- **Pilot business** — shortlist in D-016. Awaiting Anna's call.
- **Domain** — defer until name locks.
- **Re-scrape with review text?** — flagged in D-015. Decide before Phase 2.

---

## D-019 — "Median" is banned UI jargon

**2026-04-30.** Editorial review flagged "median" as confusing for non-stats readers ("median of what?"). Anna confirmed the issue 2026-05-01.

**Banned everywhere in user-facing UI:**
- Verdict card rank labels: "Above Cafes median" / "Below Cafes median" → use `#X of N in Cafes` instead
- Magnitude phrases: "5× the family median" / "above the family median" → use **"family typical"** ("more than 2× the family typical", "well behind family typical", etc.)
- Tooltips, helper copy, axis labels: same rule

**Where it's enforced:**
- `lib/editorial/family-stats.ts::buildLabel` — returns "Top of X", "Bottom of X", or "#R of N in X"
- `lib/editorial/verdict-copy.ts::comparisonPhrase` — produces "Top of Cafes · more than 2× the family typical"
- `components/insights/RowPeerStat.tsx` — reads `family typical: X` not `vs median X`
- `components/insights/SubscoreBars.tsx` — tooltip "Family typical", footer "the typical family score"
- `scripts/analyze-business.ts` — prompt forbids "median" so future regenerations match the UI voice

**Known stale content:** existing `content/analyses/*.json` files were generated before the prompt update. They contain phrases like "below the family median of 79". To eradicate fully, regenerate analyses (~$3-5 in Claude across 30 businesses). Until then, narrative copy may still leak the word "median".

---

## D-020 — Sponsor model: direct sponsorships, not AdSense

**Proposed 2026-05-01.** AdSense / programmatic banners would be off-brand and pay nothing meaningful at this scale. Right model is Pittsburgh-Magazine-style direct sponsorships, hand-curated.

**Shape (when scaffolded):**
- `content/sponsors/*.json` — one file per sponsor (logo, blurb, link, tier, run dates, slot eligibility)
- `<SponsorSlot />` component with clear "Sponsored" label, brand-matched styling, sticky on desktop / inline on mobile
- 2–3 tiers: Issue sponsor (big, runs across most pages), Section sponsor (medium, e.g. /best-on-social), Record sponsor (small, individual scorecards) — but **never on /business/[slug]** to protect editorial integrity (sponsors there could read as Relay selling rankings)
- Rotation so the same sponsor doesn't dominate

**Status:** approach agreed, not yet built.

---

## D-021 — Verdict-card visual weight reduction

**2026-05-01.** Verdict card was "heavy on the eyes" per Anna. Coordinated lightening pass while keeping all three layers of substance per row (label/value, comparison, editorial sentence).

**Changes:**
- Lime panel bg: 40% → 15% opacity
- Purple panel bg: 20% → 8% opacity
- Big value: text-lg md:text-xl → text-base md:text-lg
- Editorial sentence: text-sm black/85 → text-xs black/60
- Comparison line: black/55 → black/45
- Row spacing: 16px → 14px
- Removed duplicate ▲/▼ at section header (rows already carry them)
