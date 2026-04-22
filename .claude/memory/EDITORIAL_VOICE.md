# Editorial Voice — Copy Kit

Source: pressure-tested by `demand-gen-operator` skill, 2026-04-21.
Use `{PUB}` as placeholder for the final publication name.

---

## Ready-to-ship copy

### Masthead
```
{PUB}
The businesses Pittsburgh is talking about, ranked every quarter.
```

### Ranking stance (non-negotiable — 2026-04-22, demand-gen-operator pass)

**Revised 2026-04-22 (second pass)** — the prior "We rank signal" stance read
as social-only. Anna flagged: the ranking is also about review sentiment,
brand themes, reputation, and movement. We broadened to "the conversation"
so reviews and social both fit under one umbrella.

The reader's first-screen question is "what are you ranking?" Every explainer
must answer this before mechanics.

Primary stance (use verbatim on the HowWeRank stance block):
> "We don't rank taste. We rank the conversation."

Expanded stance (homepage hero dek):
> "How Pittsburgh's small businesses show up — in reviews, on Instagram,
> in the neighborhood conversation. Ranked every quarter on **reputation,
> presence, and momentum.** We don't rank taste."

Supporting subhead (under the stance block):
> "Reviews, sentiment, photos, Instagram, and how all of it is moving this
> quarter. Everything the city says and shows about a business — in one
> index."

The **five signals**, in canonical order, with canonical labels + captions.
These MUST stay byte-identical across `HowWeRank.tsx` (homepage) and
`SubscoreBars.tsx` (business page). If one changes, change both.

1. **Visual catalog** (`content_canvas`) — "Photos creators can pull from"
2. **Review sentiment** (`community_spark`) — "Themes, tone, and what
   reviewers keep saying"
3. **Conversion path** (`conversion_path`) — "How easy to find, visit, and
   post about"
4. **Instagram momentum** (`momentum`) — "Posts, reels, and cadence in the
   last 30 days"
5. **Creator fit** (`collab_fit`) — "Owner presence, hours, claim status"

Tier stances (appear on the business-page ScoreHero under the tier phrase —
no "signal" word; the methodology block establishes the frame):
- **Icons of the Burgh** → "Top of the index this quarter — reviews, photos,
  and momentum all moving."
- **Ones to Watch** → "Strong presence. Climbing the index."
- **Neighborhood Staples** → "Rooted in the neighborhood — the index hasn't
  caught up yet."

**Never** say any of these in ranking-explainer copy:
- "Best bakery", "top-rated", "highest quality", "finest", "most popular"
  (these imply quality judgments we don't make)
- "Scored X out of 100" (we never show the composite)
- "Grade A" (we rejected letter grades — gap-not-grade rule)
- "Our algorithm" (too SaaS; use "the index" or "the signal model")
- "AI-powered" (it's mostly deterministic scoring — don't oversell)
- "Social signal" as the sole ranking dimension (too narrow — we also score
  review sentiment, themes, volume, freshness)

### Colophon (footer of every page)
```
Published by Relay. Pittsburgh, PA.
```

### Tier labels
```
Icons of the Burgh       (80–100)
Ones to Watch            (60–79)
Neighborhood Staples     (<60)
```

### Owner first-visit (top of business page, claimed or unclaimed)
```
We built this page about [Business Name] from public data.
Here's your rank, your strongest signals, and what customers
say most. Claim the page to see the deeper view — what's holding
you back from the top, and what changed this quarter.
```
**Revised 2026-04-22** — the prior version invited editing ("If you want to edit it, you can"), which framed the page as a wiki. Owners don't want to edit; they want insights. New copy leads with value delivery + teases what's behind the claim.

### Sidebar CTA (one per CLAIMED business page only, in the quiet record zone)
```
Curious what's behind a climb?
Relay helps businesses test a creator partnership, free. →
```

### Quarterly issue email
```
Subject: Spring 2026 is out.

The new index is live. You're #14 in Lawrenceville Coffee —
up 3 spots. 18 new entries this quarter, 6 businesses moved
into Icons, and one Lawrenceville salon had the biggest jump
we've ever tracked.

Read: [link]
```

### Earned-mention pattern (editorial features)
**Rule:** Cite creators by @handle + a measurable outcome. Do not name Relay inside articles.

Default:
```
Tina @tinaeatspgh began filming for Driftwood Oven in March.
Her reel on the Sunday focaccia pull passed 40K views.
The bakery climbed 11 spots this quarter.
```

With owner quote:
```
"We started working with @tinaeatspgh last quarter," says Nora.
"It wasn't a marketing plan. She just kept coming in."
```

### Subscribe copy (gate 2)
```
Get each quarterly issue the day it drops.
4 emails a year. No filler.
```

### Claim copy (gate 3)
```
Is this your business?
Claim your page to edit details, unlock opportunities, and get
alerts when your rank changes.
```

---

## Three traps to avoid across all copy

### 1. The Yinzer trap
Do NOT lean on Pittsburgh-isms (*yinz, dahntahn, jagoff, Primanti's*) in editorial voice. Owners read it as performative. Specificity (*Lawrenceville, Butler Street, Saturday morning in the Strip*) beats dialect every time. Write like you live here, not like you're impersonating someone who does.

### 2. The "we noticed" trap
Lines like "We noticed your Instagram cadence could be stronger" imply the publication is watching the owner. **Editorial covers; it doesn't surveil.** Frame observations as findings from the data:
- ✅ "Review cadence picked up 40% after March."
- ❌ "We noticed your reviews have been stronger lately."

### 3. The creator-economy jargon trap
Never use these phrases anywhere on the property:
- "leverage creator partnerships"
- "amplify your brand"
- "content strategy"
- "organic growth"
- "authentic engagement"
- "unlock your rankings"
- "claim your free trial" (as a CTA on the property)

Editorial vocabulary:
- *posted about, filmed there, featured, covered, reviewed, climbed, moved.*

---

## The loud-quiet asymmetry

| Zone | Voice | Why |
|---|---|---|
| **Editorial features** (climber stories, Underrated Lists, neighborhood guides) | **LOUD** — strong voice, specific opinions, real stakes, Pittsburgh by first name | If features read with conviction, the ranking mechanism inherits that credibility |
| **Business pages** (the scorecard zone) | **QUIET** — closer to a Wikipedia entry than a review. Data, rank, movement, claim button | A neutral record lets the editorial be opinionated without the whole property feeling biased |
| **Colophon + sidebar CTA** | **WHISPER** — factual, bounded, never cheerleading | Relay is the publisher, not the subject |

That asymmetry — **loud editorial, quiet record, whispered Relay** — is the whole architectural trick. Owners read their page first (quiet, respectful), which builds trust. Then they browse features (loud, fun), which earns loyalty. Relay shows up in the two named places only.

---

## Patterns that recur

**Gap, not grade.** Anywhere the score appears, frame it as distance-to-next-tier, never absolute position:
- ✅ "6 points from Ones to Watch"
- ❌ "Score: 52 / 100 (Neighborhood Staple)"

**Unfair advantages.** Every business page surfaces one signal where the business outperforms the Icons tier. Nobody is only weak:
- "Your reviews mention 'feels like family' 4.2x more than any Icon-tier restaurant in Lawrenceville."

**Motion over position.** Every tier has climbers. Every tier has features. A Staple that moved #78 → #69 gets covered. An Icon that moved #4 → #2 gets covered. Movement is the story.

**Underrated framing.** Low-ranked businesses are "underrated," not weak. Being on the Underrated List is a compliment (*the city hasn't caught up to you yet*), not a callout.
