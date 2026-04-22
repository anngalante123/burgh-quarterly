# Gotchas

Non-obvious behaviors, foot-guns, hard-won lessons. Max 30 entries, rolling — remove the stalest when adding the 31st.

---

## 2026-04-21 — Apify task IDs vs dataset IDs
**Context:** scanning pilot candidates across multiple Apify tasks
**What bit:** task IDs and the `defaultDatasetId` from each run look identical (both opaque alphanum). Passed dataset IDs where task IDs belonged in a bash loop → half the tasks reported "no successful run."
**Fix:** always fetch `actor-tasks/{taskId}/runs/last?status=SUCCEEDED` first, extract `data.defaultDatasetId`, then use that for `/datasets/{id}/items`. Never conflate.
**Keep in mind:** worth labeling these clearly in any ingestion script — `taskId` and `datasetId` should be explicit names.

## 2026-04-21 — Apify scraper doesn't include review text by default
**Context:** scanning records to extract sentiment-bearing keyword clusters for Community Spark / Collab Fit scoring
**What bit:** `reviews` field is always null in current dataset. Only `reviewsCount` and `reviewsDistribution` (star breakdown) are populated.
**Fix:** re-run the scraper with `maxReviews: 10–20` configured. ~$0.01–0.03/business extra. Or deprioritize review-text-dependent signals in MVP.
**Keep in mind:** affects every sentiment-based scoring signal. Flag when we graduate to Phase 4 automation.

## 2026-04-21 — `neighborhood` field is not always populated
**Context:** scoring `pit-cph-saloncore` candidates
**What bit:** several records had `neighborhood: null` even though they had address + city. This happens for places where Google Maps doesn't resolve a tagged neighborhood.
**Fix:** fall back to geocoding the lat/lng against a Pittsburgh neighborhood polygon dataset (or use postal code as coarse proxy). For MVP: flag missing neighborhoods and exclude from neighborhood rankings until resolved.
**Keep in mind:** neighborhood rank is a first-class feature — stale/missing neighborhood = page can't show the #3-in-Lawrenceville line.

---

## How to add a gotcha

Format:
```
## YYYY-MM-DD — One-line title
**Context:** one sentence on what you were trying to do
**What bit:** what surprised you
**Fix:** what actually works
**Keep in mind:** when this would come back to bite you
```
