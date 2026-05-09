# Q2 2026 Scrape Expansion Plan

Goal: close the largest target gaps in the Spring 2026 index by running
scrape-and-queue against neighborhood-specific (or sub-type-specific)
search terms. The Apify Google Maps Scraper caps a single search at
~120 places; we beat that cap by issuing many tightly-scoped searches
and deduping at queue time.

Current coverage: 1,645 of 4,640 target (35%). After this expansion,
estimated 3,000+ businesses indexed.

Apify budget: $459 used of $800. Estimated cost of this plan: ~$45.

---

## restaurant — target gap: 860 (640 of 1,500)

28 queries. Neighborhood split. Each one includes "Pittsburgh PA" so
the Apify geo logic locates correctly even when the neighborhood is
ambiguous.

```
restaurant Lawrenceville Pittsburgh PA
restaurant Strip District Pittsburgh PA
restaurant Shadyside Pittsburgh PA
restaurant Squirrel Hill Pittsburgh PA
restaurant Bloomfield Pittsburgh PA
restaurant East Liberty Pittsburgh PA
restaurant Oakland Pittsburgh PA
restaurant Mt Washington Pittsburgh PA
restaurant South Side Pittsburgh PA
restaurant North Side Pittsburgh PA
restaurant Manchester Pittsburgh PA
restaurant Polish Hill Pittsburgh PA
restaurant Garfield Pittsburgh PA
restaurant Highland Park Pittsburgh PA
restaurant Friendship Pittsburgh PA
restaurant Greenfield Pittsburgh PA
restaurant Regent Square Pittsburgh PA
restaurant Mt Lebanon Pittsburgh PA
restaurant Sewickley PA
restaurant Wilkinsburg PA
restaurant Brookline Pittsburgh PA
restaurant Beechview Pittsburgh PA
restaurant Bethel Park PA
restaurant Dormont PA
restaurant Aspinwall PA
restaurant Millvale PA
restaurant Sharpsburg PA
restaurant Oakmont PA
```

---

## cafe — target gap: 360 (140 of 500)

Same neighborhood split. Apify's category match treats "cafe" as
synonymous with coffee shop, tea house, etc. on the result side.

```
cafe Lawrenceville Pittsburgh PA
cafe Strip District Pittsburgh PA
cafe Shadyside Pittsburgh PA
cafe Squirrel Hill Pittsburgh PA
cafe Bloomfield Pittsburgh PA
cafe East Liberty Pittsburgh PA
cafe Oakland Pittsburgh PA
cafe Mt Washington Pittsburgh PA
cafe South Side Pittsburgh PA
cafe North Side Pittsburgh PA
cafe Manchester Pittsburgh PA
cafe Polish Hill Pittsburgh PA
cafe Garfield Pittsburgh PA
cafe Highland Park Pittsburgh PA
cafe Friendship Pittsburgh PA
cafe Greenfield Pittsburgh PA
cafe Regent Square Pittsburgh PA
cafe Mt Lebanon Pittsburgh PA
cafe Sewickley PA
cafe Wilkinsburg PA
cafe Brookline Pittsburgh PA
cafe Beechview Pittsburgh PA
cafe Bethel Park PA
cafe Dormont PA
cafe Aspinwall PA
cafe Millvale PA
cafe Sharpsburg PA
cafe Oakmont PA
```

---

## bar — target gap: 270 (130 of 400)

Same neighborhood split.

```
bar Lawrenceville Pittsburgh PA
bar Strip District Pittsburgh PA
bar Shadyside Pittsburgh PA
bar Squirrel Hill Pittsburgh PA
bar Bloomfield Pittsburgh PA
bar East Liberty Pittsburgh PA
bar Oakland Pittsburgh PA
bar Mt Washington Pittsburgh PA
bar South Side Pittsburgh PA
bar North Side Pittsburgh PA
bar Manchester Pittsburgh PA
bar Polish Hill Pittsburgh PA
bar Garfield Pittsburgh PA
bar Highland Park Pittsburgh PA
bar Friendship Pittsburgh PA
bar Greenfield Pittsburgh PA
bar Regent Square Pittsburgh PA
bar Mt Lebanon Pittsburgh PA
bar Sewickley PA
bar Wilkinsburg PA
bar Brookline Pittsburgh PA
bar Beechview Pittsburgh PA
bar Bethel Park PA
bar Dormont PA
bar Aspinwall PA
bar Millvale PA
bar Sharpsburg PA
bar Oakmont PA
```

---

## fitness — target gap: 229 (71 of 300)

Different shape: fitness density is sub-type-driven, not
neighborhood-driven. There are not 100 yoga studios in Lawrenceville;
there are ~5 yoga studios across the city, plus ~5 pilates, plus ~5
climbing gyms, etc. So sub-type queries city-wide.

```
yoga studio Pittsburgh PA
pilates Pittsburgh PA
crossfit Pittsburgh PA
climbing gym Pittsburgh PA
bouldering gym Pittsburgh PA
dance studio Pittsburgh PA
ballet studio Pittsburgh PA
barre studio Pittsburgh PA
spin studio Pittsburgh PA
cycling studio Pittsburgh PA
indoor cycling Pittsburgh PA
boxing gym Pittsburgh PA
martial arts studio Pittsburgh PA
HIIT studio Pittsburgh PA
personal training Pittsburgh PA
fitness studio Pittsburgh PA
gym Pittsburgh PA
strength training Pittsburgh PA
mobility studio Pittsburgh PA
megaformer Pittsburgh PA
reformer pilates Pittsburgh PA
fitness Mt Lebanon PA
fitness Squirrel Hill Pittsburgh PA
fitness Lawrenceville Pittsburgh PA
fitness Shadyside Pittsburgh PA
fitness South Side Pittsburgh PA
fitness Strip District Pittsburgh PA
fitness Bloomfield Pittsburgh PA
```

---

## Execution order

Run as four separate `scripts/scrape-and-queue-category.ts` invocations.
Each writes new place_ids to `content/queues/<category>.json`. The
chain-detection and geo filters in `lib/data/chain-detection.ts` and
`lib/data/geo-filter.ts` apply at queue time, so out-of-metro and
chain results get dropped before any per-business spend.

After all four queues are written, run `npx tsx scripts/ingest-one.ts
--batch --category <c> --budget X` per category to ingest. Budget
estimate: ~$30 per category for 500-800 net new ingests.

## Total estimated spend

| Step | Cost |
|---|---:|
| Apify scrapes (4 categories) | ~$45 |
| Anthropic analyze (assume ~1,800 net new × $0.025) | ~$45 |
| **Total** | **~$90** |

Plus the ~$45 already needed to refresh the existing 1,559 stale-rank
analyses from tonight's earlier sweep, once the credit balance is
topped up.
