# Scoring Rubric

Creator Readiness Score — 0–100 composite across 5 weighted subscores.

---

## Subscores

### 1. Content Canvas — 25%
*Is this business visually and narratively easy for creators to feature?*

Signals:
- **Visual variety** (+) — products, interior, staff, neighborhood context, before/after, events visible in reviews/photos
- **Photography quality** (+) — proportion of Google photos that are well-lit, in-focus, composition-worthy
- **Narrative hooks** (+) — review mentions of distinctive rituals ("first pour," "handwritten notes"), signature items, sensory language
- **Sterile / generic environment** (−) — if reviews and photos describe a space that offers no visual distinction

Data sources: Google Business Profile photos, review keyword density, Instagram grid (if public handle).

### 2. Community Spark — 20%
*Is there already visible customer love that creators can amplify?*

Signals:
- **Review volume** (+) — normalized against category median
- **Review freshness** (+) — reviews in last 90 days
- **Sentiment intensity** (+) — specific affection language ("favorite," "love," "can't wait to come back")
- **UGC presence** (+) — tagged posts, customer-submitted photos, mentions in other accounts
- **Organic word-of-mouth phrases** (+) — "my friend told me about this place," "heard about it on…"

Data sources: Google Reviews, Yelp, Instagram tag search.

### 3. Conversion Path — 20%
*If attention arrives, can people easily book, order, or visit?*

Signals:
- **Booking/order link present & visible** (+)
- **Link in bio clarity** (+)
- **Business hours visible and current** (+)
- **Address + directions one tap away** (+)
- **Menu / service list accessible** (+)
- **Broken links, stale promotions, dead Facebook** (−)

Data sources: Website crawl, Google Business, Instagram bio check.

### 4. Momentum — 20%
*Is the business active enough on social that creator content can compound?*

Signals:
- **Instagram posts last 30 days** (+) — 4+ is healthy for SMB
- **Reels/TikTok last 30 days** (+) — any is good for this score
- **Engagement rate on recent posts** (+)
- **Response to customer comments** (+)
- **Dormant account** (−) — >60 days without posting

Data sources: Instagram public profile, TikTok handle if known.

### 5. Collab Fit — 15%
*Does the business have a clear local identity and likely creator audience match?*

Signals:
- **Neighborhood identity clarity** (+) — reviews reference the neighborhood; the business is *of* somewhere
- **Demographic match with local micro-creators** (+) — product/service naturally fits Pittsburgh creator audiences (food, beauty, wellness, indie retail)
- **Existing creator collaborations** (+) — any past tagged partnership
- **Reviewer language aligns with social creator voice** (+) — aesthetic, vibes, experiential
- **B2B-only / invisible-to-consumer services** (−) — naturally weaker fit

Data sources: Review keyword clustering, Instagram bio, past tag history.

---

## Composite & tiers

```
score = 0.25·content + 0.20·community + 0.20·conversion + 0.20·momentum + 0.15·collab_fit
```

Each subscore on 0–100 scale. Composite rounds to integer.

| Score | Tier label |
|---|---|
| 80–100 | **Talk of the Town** |
| 60–79 | **In the Conversation** |
| < 60 | **Word of Mouth** |

> **Display names renamed 2026-06-12** (was Icons of the Burgh / Ones to
> Watch / Neighborhood Staples). The labels describe signal presence in
> the online conversation, not business quality. Thresholds and DB tier
> keys (icons / ones_to_watch / neighborhood_staples) unchanged.
> Canonical map: `lib/tiers.ts`.

## Hard rules

- **No one sees a sub-60 score on their public page.** The raw number is never displayed — only the tier label + "gap-to-next-tier" framing.
- **Every business page surfaces one "unfair advantage"** — the dimension where the business outperforms the Talk of the Town tier median. Even a #83 business has one of these.
- **The Underrated List** pulls Word of Mouth businesses who outperform on specific signals (review sentiment, UGC presence, repeat-visit language). Editorial reward for bottom-tier scorers.
- **Movement matters more than absolute position** for editorial. A Word of Mouth business that moved +9 spots gets a feature; a Talk of the Town business at a stable #3 does not.

## Calibration protocol

Before scoring any production business, the rubric calibrates against the pilot business. Anna gut-rates each subscore 0–100. The scorer is adjusted until its output matches Anna's gut within ±7 points across all 5 subscores.

Until calibrated, any score output is provisional and should never be shown publicly.

## Data pipeline (Phase 4)

```
Apify Google Maps scraper
  → business_raw.json
Apify Instagram scraper (public profile only)
  → instagram_raw.json
Website crawler (Cheerio / Playwright)
  → website_raw.json
Normalizer (lib/data/normalize.ts)
  → business.json (matches DATA_MODEL schema)
Scorer (lib/scoring/score.ts, JSON in → score.json out)
  → score.json
```

During POC: all of this is manual. Anna enriches one business by hand; Claude scores it; we compare to her gut.
