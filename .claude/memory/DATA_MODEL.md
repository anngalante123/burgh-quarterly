# Data Model

Zod schemas live in `lib/data/schemas.ts`. This doc mirrors them.

## Business

```typescript
{
  slug: string              // kebab-case, used in URL (/business/driftwood-oven)
  name: string
  category: Category        // restaurant | cafe | salon | boutique | fitness | bakery | experience
  neighborhood: string      // "Lawrenceville", "Strip District", etc.
  address: string
  website?: string
  instagram?: string        // handle without @
  tiktok?: string
  google_rating?: number    // 0–5
  google_review_count?: number
  review_freshness_days?: number   // days since most recent review
  posts_last_30?: number
  reels_last_30?: number
  has_booking_link?: boolean
  has_ugc_visible?: boolean
  photos: { url: string; source: string }[]
  hero_photo?: string       // the one photo to lead the page with
  review_keywords: string[] // clustered phrases like "feels like family", "first bite"
  created_at: string        // ISO
  updated_at: string
  claimed: boolean
  owner_email?: string      // null until claimed
}
```

## Score

```typescript
{
  business_slug: string
  issue_slug: string        // "2026-spring"
  subscores: {
    content_canvas: number    // 0–100
    community_spark: number
    conversion_path: number
    momentum: number
    collab_fit: number
  }
  composite: number           // 0–100, rounded int
  tier: "icons" | "ones_to_watch" | "neighborhood_staples"
  rank_category: number
  rank_neighborhood: number
  rank_overall: number
  movement: {
    category: number          // +3, -1, 0, null if first issue
    neighborhood: number
    overall: number
  }
  unfair_advantage: {
    label: string             // "feels-like-family language"
    evidence: string          // "4.2x more than any Icon-tier restaurant in Lawrenceville"
  }
  scored_at: string
}
```

## Issue

```typescript
{
  slug: string                // "2026-spring"
  title: string               // "Spring 2026"
  season: "spring" | "summer" | "fall" | "winter"
  year: number
  published_at: string
  cover_blurb: string
  features: Feature[]         // climber stories
  underrated_lists: UnderratedList[]  // one per category
  stats: {
    businesses_ranked: number
    new_entries: number
    movers_into_icons: number
    biggest_climber_slug: string
  }
}
```

## UnderratedList

```typescript
{
  issue_slug: string
  category: Category
  title: string               // "Pittsburgh's Most Underrated Bakeries — Spring 2026"
  intro: string               // editorial lede
  entries: {
    business_slug: string
    rank_on_list: number      // 1–10
    why: string               // 1-sentence editorial: "the city hasn't caught up to their Sunday focaccia pull"
    evidence: string          // data fact: "'feels like family' appears 4.2x more than category median"
  }[]
}
```

## Feature (climber story)

```typescript
{
  issue_slug: string
  business_slug: string
  headline: string            // editorial headline
  dek: string                 // subtitle
  body_mdx: string            // 300–600 words
  credits: {
    creator_handles: string[] // @tinaeatspgh, etc. — Relay NEVER named here
    photographer?: string
  }
  movement: { from: number; to: number }
  published_at: string
}
```

## LeadCapture

```typescript
{
  id: string                  // uuid
  email: string
  source: "subscribe" | "claim" | "alerts"
  business_slug?: string      // if claim or alerts
  owner_name?: string
  verification_answer?: string // claim: "what's the name of your head chef" type prompt
  claim_status?: "pending" | "verified" | "rejected"
  opted_in_alerts: boolean
  created_at: string
  consent_ip?: string
  consent_ua?: string
}
```

## File layout

```
content/
├── businesses/
│   ├── driftwood-oven.json
│   └── ...
├── issues/
│   └── 2026-spring/
│       ├── issue.json
│       ├── features/
│       │   └── driftwood-climb.mdx
│       └── underrated/
│           └── bakeries.json
└── leads/                    ← POC storage; move to Neon when ready
    └── leads.jsonl
```

Schemas validate on read *and* write. If a file fails Zod, the build fails loudly — data integrity > convenience.
