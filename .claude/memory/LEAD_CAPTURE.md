# Lead Capture — 3-Tier Gate

Publication model framing: every capture point is a **subscribe-to-the-publication** moment, never a "unlock your rankings" paywall. Friction is real but earns its keep.

---

## Gate 1 — Public (no friction)

Visible to everyone, no email required:

- Homepage (current issue teaser)
- Top 10 per category
- Business pages: name, tier, unfair advantage, rank (number), movement arrow, claim affordance
- One featured editorial per issue
- About + Colophon

**No Relay CTA visible here.** This is the trust-building zone.

---

## Gate 2 — Email gate (subscribe to read)

Modal / inline subscribe pattern. Not a hard wall — on the 3rd scroll or when clicking into restricted content, the subscribe card appears.

**Gated content:**
- The Underrated List (full — public page shows title + top 3 only)
- Movement tracker (who climbed, who dropped, all tiers)
- Neighborhood deep-dives (full editorial)
- Issue archive (past issues)

**The form (minimalist):**
```
Get each quarterly issue the day it drops.
4 emails a year. No filler.

[ email address ]
[ Subscribe ]
```

**What happens:**
1. POST to `/api/subscribe`
2. Write to `content/leads/leads.jsonl` (POC)
3. Resend confirmation email (double opt-in recommended but not MVP)
4. Redirect back to the content they were trying to read

**Data captured:** email, timestamp, source page, UA, IP.

---

## Gate 3 — Claim gate (verify ownership to unlock)

On every unclaimed business page, a modest "Claim" link under the masthead:

```
Is this your business? Claim it →
```

**The claim flow (`/claim/[slug]`):**

1. Email + name
2. A verification question specific to the business (helps prove ownership):
   - "What's on your menu for under $10?"
   - "What's your booking URL?"
   - "What's your latest Instagram post about?"
3. Submit → auto-email verification link (Resend)
4. Click-through → claim marked as `verified` in leads.jsonl
5. Redirect to `/business/[slug]?claimed=true` with the Opportunities view unlocked

**What the claim unlocks:**

- **Opportunities view** — the private candid diagnosis (weaknesses + specific action items)
- **Edit page info** — update hours, URL, photos, brief
- **Movement alerts opt-in** — email when rank changes or a peer in the neighborhood passes them
- **The Relay sidebar CTA** — appears here and only here:
  ```
  Curious what's behind a climb?
  Relay helps businesses test a creator partnership, free. →
  ```

---

## Data retention + honesty rules

- Every email capture records IP + UA + timestamp for consent proof
- Unsubscribe link in every email (Resend handles this)
- Claim verification must be a real check — never rubber-stamp unverified claims onto the public record
- No email sold, shared, or sent to anyone outside of {PUB} quarterly issues + opt-in alerts + Relay's direct relationship (if the owner has explicitly triggered the sidebar CTA)

## Anti-patterns to refuse

- ❌ Modals that block the entire page on first load
- ❌ Dark patterns (pre-checked alert opt-ins, hidden unsubscribe, etc.)
- ❌ Hard paywalls on any business's own page — owners must never be locked out of their own record
- ❌ "Verify your email to see your score" — the score is public on the page. This is a publication, not a gate around public data.

## MVP build order

1. Subscribe form + POST endpoint + Resend confirmation (gate 2)
2. Claim form + verification email (gate 3)
3. Opportunities view (private route, gated by `claimed=true` + auth)
4. Movement alerts opt-in (post-launch)

Auth for claimed pages: start with a signed URL in the verification email. Graduate to magic-link auth (Resend supports it) when we have more than a handful of claimed pages.
