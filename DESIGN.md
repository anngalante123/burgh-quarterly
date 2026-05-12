---
name: Signal Pittsburgh
description: A quarterly editorial publication ranking Pittsburgh small businesses by creator-readiness signals. Editorial all the way through — sharp, confident, generous.
colors:
  brand-purple: "#AB35EE"
  brand-lime: "#C6F432"
  brand-black: "#0F0F0F"
  brand-lavender: "#F5F0FA"
  brand-cream: "#F5F8E8"
  brand-newsprint: "#F0EEE9"
  brand-newsprint-warm: "#E8E3D6"
  brand-terracotta: "#D97757"
  data-blue: "#209AFF"
  data-lavender: "#ABB5FE"
  data-cyan: "#01EFFF"
  data-teal: "#0EB2E8"
typography:
  display:
    fontFamily: "Unbounded, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "Unbounded, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  kicker:
    fontFamily: "Unbounded, sans-serif"
    fontSize: "0.62rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.22em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  caption:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.04em"
rounded:
  none: "0"
  sm: "2px"
  md: "4px"
  lg: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  tier-pill-icons:
    backgroundColor: "{colors.brand-lime}"
    textColor: "{colors.brand-black}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
    typography: "{typography.kicker}"
  tier-pill-watch:
    backgroundColor: "{colors.brand-purple}"
    textColor: "{colors.brand-lavender}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
    typography: "{typography.kicker}"
  tier-pill-staple:
    backgroundColor: "{colors.brand-cream}"
    textColor: "{colors.brand-black}"
    rounded: "{rounded.none}"
    padding: "2px 6px"
    typography: "{typography.kicker}"
  highlight-block:
    backgroundColor: "{colors.brand-lime}"
    textColor: "{colors.brand-black}"
    rounded: "{rounded.none}"
    padding: "0 4px"
  cta-primary:
    backgroundColor: "{colors.brand-purple}"
    textColor: "{colors.brand-lavender}"
    rounded: "{rounded.none}"
    padding: "10px 18px"
    typography: "{typography.kicker}"
  card-quiet:
    backgroundColor: "{colors.brand-cream}"
    textColor: "{colors.brand-black}"
    rounded: "{rounded.sm}"
    padding: "20px 24px"
  card-loud:
    backgroundColor: "{colors.brand-black}"
    textColor: "{colors.brand-lavender}"
    rounded: "{rounded.sm}"
    padding: "24px 28px"
---

## Overview

Signal Pittsburgh's visual system is editorial-magazine-meets-data-publication. It pairs heavyweight Unbounded display type with calm DM Sans body copy, deploys lime as a highlighter and purple as the conversion accent, and uses no rounded corners on most surfaces (square edges convey "record," not "app"). Color zones do most of the visual storytelling; motion is restrained but specific (Ken-Burns on hero photos, scan-sweep on diagnosis pull-quotes, micro-celebrations on rank reveals).

The system is built for both editorial-loud surfaces (homepage hero, issue features, "diagnosis" pull-quotes) and editorial-quiet-but-still-opinionated surfaces (business records, scoreboards, peer comparisons). Per the 2026-05-09 architectural shift in PRODUCT.md, all surfaces are now editorial; the previous "loud editorial / quiet record" split is retired in favor of a single confident voice with two register intensities.

## Colors

The palette has three roles: brand identity, editorial surface, and tier signaling.

**Identity palette (Relay brand kit).**
- `brand-purple` `#AB35EE` — primary accent, CTAs, links, "Ones to Watch" tier, Relay touch.
- `brand-lime` `#C6F432` — highlight blocks behind key words, "Icons" tier, the "you are here" micro-celebration. Used as a highlighter, not as a background-fill.
- `brand-black` `#0F0F0F` — display type, primary text, "loud editorial" surface backgrounds (issue covers, masthead).

**Surface palette.**
- `brand-lavender` `#F5F0FA` — page background, warm white-lavender. Default canvas.
- `brand-cream` `#F5F8E8` — section backgrounds, "Doing well" cards, expanded scoreboard panels. Warmer than the page; signals "this is data."
- `brand-newsprint` `#F0EEE9` — heavier editorial blocks, deep-record zones.
- `brand-newsprint-warm` `#E8E3D6` — used sparingly for the warmest editorial surfaces.

**Signal palette.**
- `brand-terracotta` `#D97757` — second accent, used for trends and "dropped from" framing. Never a CTA color.
- `data-blue` `#209AFF`, `data-lavender` `#ABB5FE`, `data-cyan` `#01EFFF`, `data-teal` `#0EB2E8` — data-viz palette for charts and momentum indicators. Reserved for charts only; never UI chrome.

**Contrast floor.** Body text at 4.5:1 minimum (WCAG AA). Lime highlight blocks always pair with `brand-black` text (passes AA). Purple CTAs pair with `brand-lavender` (passes AA).

## Typography

Two families, used with strict hierarchy.

**Unbounded** — display, headings, kickers, tier pills. Weight 900 for hero displays, 800 for section headings, 600 for kickers and labels. ALL CAPS for kickers and tier pills (with letter-spacing `0.22em`); mixed case for display headings (with negative letter-spacing `-0.01em` to tighten the air).

**DM Sans** — body, captions, micro-copy. Weight 400 for body, 500-700 for emphasis. No all-caps in body copy.

**Hierarchy in practice:**
- **Display** (clamp 2.5rem to 5rem, 900 weight, mixed case): hero on home, business name on records, issue titles. The lime `highlight-block` highlighter sits behind the most provocative word in any display sentence.
- **Heading** (1.5rem, 800 weight): section headers within a page (e.g., "WHERE YOU SIT IN ITALIAN RESTAURANTS"). Almost always paired with a thin border-bottom and a small right-aligned counter ("76 IN THIS FAMILY").
- **Kicker** (0.62rem, 600, ALL CAPS, 0.22em tracking): labels above sections, tier pills, taxonomy markers ("THE NUMBERS · SPRING 2026"). The publication's "voice tag" — appears in several variants throughout.
- **Body** (1rem, DM Sans 400): editorial paragraphs. Max width ~640px for readability. Body-small (0.875rem) for secondary description text inside cards.
- **Caption** (0.7rem, with light tracking): credits, methodology footnotes, axis labels.

## Elevation

The system is largely flat. Cards differentiate by background color and border weight, not by drop shadows.

- **Default:** flat against the page background. No shadow.
- **Card-quiet:** `brand-cream` background on the `brand-lavender` page → reads as a recessed panel without a shadow. Used for scoreboard rows, "doing well" panels.
- **Card-loud:** `brand-black` background → reads as a card lifted above the page through contrast alone. Used for diagnosis pull-quotes and editorial features.
- **Hover state on interactive elements:** inset 2px ring (`brand-black/45`) instead of a drop shadow. Pinned/active state: inset 2px ring at higher opacity (`brand-black/65`). The visual logic is "I'm being held" rather than "I'm floating."
- **Brutalist accent on key cards:** offset hard-shadow `3px 3px 0 0 var(--color-brand-purple)` on popovers and important cards. Square corners, no blur, no fade. Editorial publication, not a SaaS app.

## Components

### Tier pills

Three variants — `tier-pill-icons` (lime), `tier-pill-watch` (purple), `tier-pill-staple` (cream-with-thin-black-border). All use kicker typography, square corners, ~6px horizontal padding. Tier pills appear inline next to business names everywhere they're listed.

### Highlight block

A lime background behind 1-3 words inside a display sentence ("PITTSBURGH SMALL BUSINESSES, RANKED ON SOCIAL." with `SOCIAL` highlighted). The publication's signature device. Used at most once per sentence, on the most provocative word.

### CTA primary

Purple background, off-white text, kicker typography, square corners. The "Get matched, free" button on every page is the canonical instance. Appears at most twice per page (once as a hero anchor, once in the right rail or footer).

### Card-quiet vs Card-loud

Two card styles based on register intensity. **Card-quiet** is the default for data-record content (scoreboards, signal lists, peer comparisons): cream background, black text, square corners, 20-24px padding. **Card-loud** is for editorial pull-quotes and feature cards: black background, off-white text, often with a lime highlight inside, larger padding (24-28px). Don't mix the two on a single page section.

### Tier proportion bar (where-you-sit)

Single horizontal bar split into three colored zones (lime / purple / cream) sized proportionally to actual tier counts in the peer scope. One YOU marker. Click any zone to reveal the top 3 peers in that tier. The bar replaces the older per-business dot strip; see `components/insights/TierProportionBar.tsx`.

### Peer scoreboard

A compact named-row list (`components/insights/PeerScoreboard.tsx`) with three layouts based on the user's position: top-of-family, middle-of-family, bottom-of-family. Each row: rank · business name · tier pill. The current business gets a left-edge lime indicator strip. Editorial sentence above the rows names a specific rival when one exists.

### Subscore row + bullets

Each subscore (visual catalog, review sentiment, conversion path, IG momentum, creator fit) gets a horizontal bar with a tick at family typical and a fill for the business's score, plus an expandable detail panel. Detail bullets now show pass/fail icons (`✓` lime for found, `✕` purple for missing) + a summary line ("3 of 4 markers present") so the verdict has a visible reason.

## Do's and Don'ts

**Do**
- Use the lime highlight block for one provocative word per display sentence. The highlighter is the brand.
- Use square corners on most surfaces. Editorial publication, not a SaaS app.
- Pair every numeric rank with a sub-category label ("Italian Restaurants" not just "Restaurants").
- Frame low-tier results as "underrated" or "distance to next tier," never as failure.
- Use kicker (Unbounded ALL CAPS, 0.22em tracking) for taxonomy labels, tier pills, and section anchors.
- Keep body text under 640px width for readability.
- Animate purposefully: Ken-Burns on hero photos, scan-sweep on diagnosis pull-quotes, micro-celebration on rank reveals. Every animation respects `prefers-reduced-motion`.
- Use the proportional tier bar for "where you sit" comparisons. Per-business dot strips don't scale past N=15.

**Don't**
- Don't show numeric composite scores publicly (0-100). Subscore numbers also stay hidden; bars encode visually.
- Don't use letter grades. Distance-to-next-tier framing only.
- Don't name Relay in articles. The publisher appears in two places: masthead colophon and the sidebar CTA on claimed business pages.
- Don't use the word "median" in user-facing copy. Use "family typical" or "#R of N in [Family]".
- Don't deploy a drop shadow when an inset ring or square hard-shadow would do. The system is flat; depth comes from color and offset, not blur.
- Don't reach for the data-viz palette (`data-blue`, `data-cyan`, etc.) for UI chrome. It's reserved for charts.
- Don't mix card-quiet and card-loud in one page section. Pick a register, hold it.
- Don't use yinzer dialect (yinz, dahntahn, jagoff, Primanti's clichés). Pittsburgh-specific without being kitschy.
- Don't use marketing-tool jargon: "leverage creator partnerships," "amplify your brand," "organic growth," "authentic engagement," "AI-powered," "our algorithm."
