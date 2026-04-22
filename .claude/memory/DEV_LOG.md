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
