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
