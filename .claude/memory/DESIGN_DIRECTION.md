# Design Direction — Spring 2026 visual pass

Source of truth for the Pittsburgh Social Scorecard aesthetic that's being ported
into The Burgh Quarterly. Captured after the 2026-04-22 "design is lackluster"
feedback — use this doc before touching any visual components.

> **TIER RENAME NOTE 2026-06-12.** Tier display names changed: "Icons of the Burgh" is now "Talk of the Town", "Ones to Watch" is now "In the Conversation", "Neighborhood Staples" is now "Word of Mouth" (signal-presence language; keys and thresholds unchanged; canonical map in `lib/tiers.ts`). Tier-name examples below are historical; the per-tier visual treatments (lime / purple / cream) are unchanged and still apply.

## The shift

The prior aesthetic was typography-forward editorial (Infatuation/Eater feel):
lavender off-white ground, bold black display type, one lime highlight. It was
clean but visually thin — almost no data visualization, no graphs, no
second accent, no dark surface to give the publication "weight."

The new aesthetic pulls from `/Users/annamariegalante/Downloads/Pittsburgh Social
Scorecard.html` — specifically the dark masthead, warm newsprint ground, giant
tier visualization on the business page, and labeled progress bars for each
subscore. It reads like an index, not a magazine.

## Brand sub-mark

Introducing **PGH · Signal Index** as a sub-brand for the ranking mechanism.
- The publication is still "The Burgh Quarterly"
- The ranked-data zone (business pages, homepage signal strip, underrated lists)
  carries the "PGH · Signal Index" stamp — this is where the quantitative work
  lives, and it gets its own visual language (dark band, lime, subscore bars)
- Analogous to Eater 38, Michelin Guide's map view, or the NYT's Upshot

## Tokens

Additions in `app/globals.css` (`@theme inline`):
- `--color-brand-newsprint: #F0EEE9` — body ground (warm cream, replaces
  lavender off-white as the default page surface)
- `--color-brand-newsprint-warm: #E8E3D6` — deeper cream for section blocks
- `--color-brand-terracotta: #D97757` — second accent. Used for trend arrows,
  peer-position dots, "dropped" movement indicators, momentum warning states

Kept:
- `brand-purple #AB35EE`, `brand-lime #C6F432`, `brand-black #0F0F0F`
- `brand-off-white #F5F0FA` still used for dark-surface text contrast
- `brand-cream #F5F8E8` still used for the Staples tier badge

Body bg in `app/layout.tsx` moved from `bg-brand-off-white` → `bg-brand-newsprint`.

## Masthead + Colophon (2026-04-22 rebuild)

Both now sit on a solid black band with lime wordmark.
- Home variant: narrow top strip with "PGH · Signal Index · Spring 2026" stamp,
  then wordmark + tagline
- Compact variant: inline wordmark + issue stamp on one band
- The wordmark is still "The Burgh Quarterly" — split across two colors:
  "The Burgh" in lime, "Quarterly" in off-white

## Gap, not grade — still the rule

The HTML reference showed "A+" letter grades. We deliberately rejected that in
this pass (per user, 2026-04-22, and EDITORIAL_VOICE.md § gap-not-grade).
What we *are* importing from that visual: the size and weight. The business
page hero now uses the tier label + rank + distance-to-next-tier phrase at
grade-like scale, so the page still has a bold anchor without exposing a
number or a letter.

## What the business page now shows (target)

1. **Score hero** (top of the quiet-record zone):
   - Huge tier phrase ("Ones to Watch") at display scale
   - Category rank (#1 in Pittsburgh Bakeries) secondary
   - Neighborhood rank tertiary
   - Movement chip (lime ↑, terracotta ↓)
   - If claimed: gap-to-next-tier phrase in a private-view strip
2. **Subscore bars** — 5 horizontal progress bars (content_canvas,
   community_spark, conversion_path, momentum, collab_fit) with:
   - Labeled fill
   - Peer-median tick mark (from all businesses in the same category)
   - Terracotta when below median, lime when above, black otherwise
   - **Never displays the numeric score** — fill width encodes it visually
3. **Peer dot plot** — one-axis scatter showing this business as the lime
   dot vs category peers as black dots. No scores shown; position = rank
4. **Momentum sparkline** — 30-day IG post cadence (flat line when
   dormant — this is the Relay conversion visual)
5. Existing insight blocks stay: UnfairAdvantage, SignalOfQuarter, ReviewVoice,
   PeerPulse, SocialState, SocialTrend, Photos, Reviewers say

## What the homepage now shows (target)

Keeping: Masthead (dark), hero coverline, editorial teasers (Read), Featured block,
Subscribe.
Adding: a **"This Quarter in Signal"** strip between Hero and Read, with:
- Tier distribution donut (4/11/15 across 30 scored)
- Count cards: "18 new", "6 climbed a tier", "1 biggest jump"
- Neighborhood distribution bar
- "View full index" link

## Underrated List (new route)

`/underrated/bakeries` (and eventually other categories). The main conversion
engine — low-tier businesses framed flatteringly.
- Editorial intro (loud voice)
- 5 bakeries from Neighborhood Staples + bottom of Ones to Watch
- Each entry: headline + 1-sentence editorial take + one signal stat
- Links to business pages
- Ends with a subscribe CTA

## Rules for future visual work

- Dark surface = publication identity zone (masthead, colophon)
- Newsprint ground = editorial surface (everything else)
- Lime = score peaks / Icons / climbers / "on" state
- Terracotta = below-median / dropped / momentum warning / second-accent viz
- Purple = Ones to Watch badge + primary link/focus ring
- Never display a numeric composite score (0-100) anywhere public
- Subscore numbers are also hidden — bars encode them visually
- Letter grades are NOT used — gap-to-next-tier is the only private-view framing

## File locations

- Design shift: this file, 2026-04-22
- Tokens: `app/globals.css`
- Masthead + Colophon: `components/Masthead.tsx`, `components/Colophon.tsx`
- Score hero + subscore bars (being built): `components/insights/ScoreHero.tsx`,
  `components/insights/SubscoreBars.tsx`, `components/insights/PeerDotPlot.tsx`,
  `components/insights/MomentumSparkline.tsx`
- Homepage signal strip (being built): `components/SignalStrip.tsx`
- Underrated List (being built): `app/underrated/[category]/page.tsx`
