# CLAUDE.md — Signal Pittsburgh

> **First thing, every session:** read `.claude/memory/TODO.md` and the last entry in `.claude/memory/DEV_LOG.md`. That tells you where we left off.

## What this is

**Signal Pittsburgh** (renamed from "The Burgh Quarterly" on 2026-05-12; repo dir still named burgh-quarterly for path stability) is a quarterly editorial publication that ranks Pittsburgh's small businesses by creator-readiness. It is **not a lead magnet** and not a sales tool. It is a property that local business owners find genuinely valuable on its own, something they check, share, claim, and try to climb.

Relay (run-relay.com) publishes it. Relay is a vetted local micro-influencer platform. The publication drives quiet trial adoption as a side effect of being good. It does not pitch.

**North-star framing:**
*"The businesses Pittsburgh is talking about, ranked every quarter."*

## The two architectural tricks

1. **Loud editorial, quiet record.** Editorial features have strong voice. Business pages (the scorecard zone) stay Wikipedia-neutral. The contrast is what lets the editorial be opinionated without the whole property feeling biased.

2. **Word of Mouth** (renamed from "The Underrated List" 2026-06-14, display-only; slugs, routes under `/underrated`, and the `underrated` ranking key are unchanged for URL/code stability). Low-ranked businesses are not shamed, they're celebrated as carried by word of mouth: loud reviews, loyal regulars, a quiet feed. Each quarterly issue features a recurring "Word of Mouth: Pittsburgh's [Category]" list. This is where the businesses Relay most wants to convert get editorial recognition, not critique. The reframe moved the story onto the social-media gap (great room, quiet feed) rather than an "underrated" quality verdict.

Full voice rules in `.claude/memory/EDITORIAL_VOICE.md`.

## Tech stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript strict
- **Styling:** Tailwind v4 + shadcn/ui
- **Type fonts:** Unbounded (display) + DM Sans (body), via `next/font/google`
- **Validation:** Zod
- **Forms:** React Hook Form + `@hookform/resolvers/zod`
- **Email:** Resend + React Email
- **Data (POC):** JSON files in `content/businesses/`
- **Data (later):** Neon Postgres via Vercel Marketplace
- **Hosting:** Vercel
- **Data pipeline (Phase 4):** Apify for Google Maps + Instagram, Claude API for scoring + editorial drafts

## Brand tokens (Relay brand kit)

| Token | Hex | Use |
|---|---|---|
| `brand-purple` | `#A855F7` | primary accent, buttons, links |
| `brand-lime` | `#C6F432` | highlight blocks, hover states, score peaks |
| `brand-black` | `#0F0F0F` | display type, primary text |
| `brand-lavender` | `#F5F0FA` | page background (warm white-lavender). Renamed from `brand-off-white` on 2026-05-12; the value was always lavender. |
| `brand-cream` | `#F5F8E8` | section backgrounds (warm cream-yellow) |

Concept: **Bold, Playful, Trendy.** Display headlines in Unbounded Black, all caps, with the lime as highlight-block backgrounds behind key words. Body in DM Sans.

*Exact hex values verified against the source brand kit on [pickup date]. If swatches shift, update here and in `.claude/memory/DECISIONS.md`.*

## Architecture

```
app/
├── (marketing)/          ← public editorial + homepage
├── (issue)/[slug]/       ← quarterly issues
├── business/[slug]/      ← business pages (quiet record zone)
├── claim/[slug]/         ← claim flow (gate 3)
├── subscribe/            ← subscribe landing (gate 2)
└── api/
    ├── subscribe/        ← Resend + lead write
    ├── claim/            ← verify + unlock Opportunities view
    └── alert-signup/     ← movement alerts opt-in

lib/
├── scoring/              ← 5-factor weighted rubric
├── editorial/            ← Claude prompt templates
└── data/                 ← Zod schemas, normalizers

scripts/                  ← data pipeline (Phase 4)
content/
├── issues/               ← issue markdown
└── businesses/           ← business JSON records
```

Full data model in `.claude/memory/DATA_MODEL.md`. Scoring rubric in `.claude/memory/SCORING_RUBRIC.md`. Lead gate spec in `.claude/memory/LEAD_CAPTURE.md`.

## Commands

```bash
npm run dev          # localhost:3000
npm run build        # production build
npm run lint         # eslint

# Data scripts (Phase 4+)
npm run score        # recompute all scores
npm run issue:new    # scaffold next quarterly issue
```

## Editorial voice — the non-negotiables

Read `.claude/memory/EDITORIAL_VOICE.md` for the full copy kit. Short version:

**Never use:**
- "Leverage creator partnerships," "amplify your brand," "content strategy," "organic growth," "authentic engagement" — ad-tech jargon that kills trust
- "We noticed your [X] could be stronger" — patronizing; editorial covers, it doesn't surveil
- Yinzer-isms (yinz, dahntahn, jagoff, Primanti's clichés) — performative
- "Unlock your rankings" — gatewall energy; use "subscribe to the issue" instead

**Always:**
- Name creators by handle when they appear in editorial. Never name Relay inside an article.
- Relay appears in exactly two places: the masthead colophon and one sidebar CTA on *claimed* business pages.
- Frame weaknesses as "distance to next tier" or "unclaimed opportunities," never as failures.
- Every business page surfaces at least one dimension where the business outperforms the Talk of the Town tier (the `icons` key; display names renamed 2026-06-12, see `lib/tiers.ts`) — no business is only weak.

## Current phase

**Phase 1 — The Scaffold.** Infra + memory + pilot business calibration.

See `.claude/memory/TODO.md` for next-session work.

## Notes for future Claude sessions

- This project is a **publication**, not software. Treat editorial decisions as product decisions.
- Anna is a non-engineer founder (BlastPoint). Explain tech in business terms.
- Before recommending a fix that involves files or flags, verify they exist — per her global memory rules.
- Screenshots are the compiler. No UI work is "done" without a screenshot at desktop + mobile + tablet.
