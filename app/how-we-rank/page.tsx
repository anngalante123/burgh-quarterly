import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";

/**
 * /how-we-rank, the flagship methodology page.
 *
 * This is the single canonical explainer for how Signal Pittsburgh ranks
 * Pittsburgh's small businesses. About stays the publisher/mission page.
 * Every "Full methodology →" link on the property points here.
 *
 * Voice is loud-editorial (Pittsburgh by first name, concrete examples,
 * opinions taken). The five signal labels + captions are byte-identical
 * with components/HowWeRank.tsx and components/insights/SubscoreBars.tsx.
 * If they change here, change them in both other files in the same commit.
 *
 * No em dashes anywhere on this page. No numeric scores. No letter grades.
 */

export const metadata = {
  title: "How we rank | Signal Pittsburgh",
  description:
    "How Signal Pittsburgh ranks the city's small businesses every quarter. Five signals, public data, no pay-for-placement, no taste judgments. Published by Relay.",
};

// Canonical, byte-identical with HowWeRank.tsx and SubscoreBars.tsx.
const SIGNALS: Array<{
  label: string;
  caption: string;
  body: React.ReactNode;
}> = [
  {
    label: "Visual catalog",
    caption: "Photos creators can pull from",
    body: (
      <>
        <p>
          A creator opens a business profile and scrolls. If the photos are
          ten years old, dim, or shot from the wrong side of the room, there
          is nothing to post with. The visual catalog measures how much
          usable material exists. Counts, freshness, variety, the basics.
        </p>
        <p>
          Pusadee&apos;s Garden ranks high here for a reason. The room is
          already lit like a set. Anyone with a phone can leave with a frame
          that travels. That counts.
        </p>
      </>
    ),
  },
  {
    label: "Review sentiment",
    caption: "Themes, tone, and what reviewers keep saying",
    body: (
      <>
        <p>
          Volume matters, but tone matters more. We read the reviews and
          look at what reviewers keep saying. The repeated phrases. The
          words a business owns in the city&apos;s head. Five stars with no
          texture moves the needle less than four stars where everyone is
          writing about the same thing.
        </p>
        <p>
          Page&apos;s Dairy Mart has decades of reviews where people are
          writing the same sentence in different ways. South Side. Summer.
          Line down the block. That kind of consistency is its own signal.
        </p>
      </>
    ),
  },
  {
    label: "Conversion path",
    caption: "How easy to find, visit, and post about",
    body: (
      <>
        <p>
          The path from curious to in-the-door. Hours posted and accurate.
          A real address with a real pin. A website that loads. Clear
          signage in the photos so a creator filming a reel knows what
          name to tag. Friction here is invisible to owners and obvious to
          everyone trying to visit for the first time.
        </p>
        <p>
          La Gourmandine has clean hours, clean photos of the storefront,
          and a tagged location that actually works. Small things. They
          stack.
        </p>
      </>
    ),
  },
  {
    label: "Instagram momentum",
    caption: "Posts, reels, and cadence in the last 30 days",
    body: (
      <>
        <p>
          Not follower count. Cadence. What has the account done in the
          last 30 days, and what has the city done with it. Posts, reels,
          tagged content from customers, the loop where a business posts
          and the neighborhood reposts. A quiet account with 40,000
          followers ranks below a busy account with 4,000.
        </p>
        <p>
          When Driftwood Oven posts a Sunday focaccia pull, the photo
          travels. Saved, shared, reshot by a creator who walked in
          because of it. That is what momentum looks like in this index.
        </p>
      </>
    ),
  },
  {
    label: "Creator fit",
    caption: "Owner presence, hours, claim status",
    body: (
      <>
        <p>
          The last signal is the most human one. Is there an owner on the
          page. Are the hours kept up. Has the business claimed its
          profile so a creator who reaches out gets a real reply. A
          beautiful catalog and strong reviews still leave a creator
          guessing if nobody is answering the door.
        </p>
        <p>
          Apteka has this one nailed. The kitchen has a voice on the
          internet, the hours stay current, the photos get refreshed.
          A creator pitching them knows what they are walking into.
        </p>
      </>
    ),
  },
];

const TIERS: Array<{ name: string; line: string }> = [
  {
    name: "Icons of the Burgh",
    line: "Top of the index this quarter. Reviews, photos, and momentum all moving in the same direction.",
  },
  {
    name: "Ones to Watch",
    line: "Strong presence, climbing. The city is starting to catch on.",
  },
  {
    name: "Neighborhood Staples",
    line: "Rooted in the neighborhood. The index hasn't caught up to them yet.",
  },
];

const IN_SOURCES: string[] = [
  "Google Business Profile, public fields",
  "Public Google reviews and review text",
  "Public Instagram posts, reels, and tagged content",
  "Public TikTok mentions",
  "Public hours, addresses, and claim status",
];

const OUT_SOURCES: string[] = [
  "Paid placements or sponsored content",
  "Owner self-reported numbers",
  "Advertising spend on any platform",
  "Follower counts read in isolation",
  "Anything behind a login or a paywall",
];

export default function HowWeRankPage() {
  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 text-brand-black">
        {/* ── 1. HERO / STANCE ──────────────────────────────────── */}
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-10 md:pt-16 md:pb-14">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">How we rank</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2.25rem,7vw,5.5rem)] leading-[0.94]">
              We don&apos;t rank{" "}
              <span className="line-through decoration-brand-purple decoration-4">
                taste
              </span>
              . We rank the{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                conversation
              </span>
              .
            </h1>

            <div className="mt-8 max-w-2xl space-y-4 font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
              <p>
                A bakery in Lawrenceville and a salon in Bloomfield are not
                the same kind of business. But the same five things tell you
                whether either one is having a moment in this city.
              </p>
              <p>
                This is not a best-of list. We do not taste the croissants.
                We watch what Pittsburgh says, posts, and films about a
                place, and we publish the result every quarter.
              </p>
              <p className="text-brand-black/65">
                If you want to know why a business sits where it does on the
                index, the answer is on this page.
              </p>
            </div>
          </Reveal>
        </article>

        {/* ── 2. WHY CONVERSATION, NOT TASTE ────────────────────── */}
        <section className="border-t-2 border-brand-black bg-brand-cream">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Why conversation, not taste
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                The stance
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(16rem,1fr)_2fr] gap-10 md:gap-14">
              <div>
                <p className="font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.02]">
                  Conversation is what the{" "}
                  <span className="bg-brand-lime px-2 box-decoration-clone">
                    city is doing
                  </span>{" "}
                  around a business.
                </p>
              </div>

              <div className="space-y-5 font-body text-base md:text-lg text-brand-black/85 leading-relaxed max-w-3xl">
                <p>
                  Conversation is the reviews. The photos on Google. The
                  reels someone posts after dinner. What surfaces when a
                  newcomer types the place into search. Taste is a
                  critic&apos;s verdict on the food, the cut, the cocktail.
                  Critics are great. This isn&apos;t one.
                </p>
                <p>
                  We rank what the city is doing around the business, not
                  the work of the business itself. An owner can run a
                  perfect kitchen and still land low if nobody is talking
                  about it. That is a finding, not a flaw. It means the
                  index has spotted a gap between the room and the room&apos;s
                  reputation, and that gap is usually the most useful thing
                  on the page.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── 3. THE FIVE SIGNALS ──────────────────────────────── */}
        <section className="border-t-2 border-brand-black">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                The five signals
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Recomputed quarterly
              </span>
            </div>

            <p className="max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed mb-12">
              The composite is built from five signals, in this order, and
              they map one-to-one with the bars on every business page. The
              labels do not change between issues.
            </p>

            <ol className="space-y-12 md:space-y-14">
              {SIGNALS.map((s, i) => (
                <li
                  key={s.label}
                  className="grid grid-cols-1 md:grid-cols-[6rem_minmax(0,1fr)] gap-4 md:gap-10 border-t border-brand-black/15 pt-8"
                >
                  <div className="flex md:block items-baseline gap-3">
                    <span
                      aria-hidden="true"
                      className="font-display text-2xl md:text-4xl font-black tabular-nums text-brand-purple tracking-[-0.02em]"
                    >
                      0{i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 max-w-3xl">
                    <p className="font-display text-lg md:text-2xl font-black uppercase tracking-[-0.01em] text-brand-black leading-tight">
                      {s.label}
                    </p>
                    <p className="mt-2 font-display text-xs md:text-sm font-semibold uppercase tracking-[0.14em] text-brand-black/55">
                      {s.caption}
                    </p>
                    <div className="mt-5 space-y-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
                      {s.body}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* ── 4. THE TIERS, AND WHY NO NUMBERS ─────────────────── */}
        <section className="border-t-2 border-brand-black bg-brand-cream">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                The tiers, and why no numbers
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Gap, not grade
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-12">
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className="border border-brand-black/15 bg-white/70 p-5"
                >
                  <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple">
                    {tier.name}
                  </p>
                  <p className="mt-3 font-body text-sm md:text-base text-brand-black/85 leading-snug">
                    {tier.line}
                  </p>
                </div>
              ))}
            </div>

            <div className="max-w-3xl space-y-5 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
              <p>
                We do not publish numeric scores. Not because we are hiding
                them. Because a 78 next to an 82 is meaningless to a
                reader, and the gap between them is not what we want
                someone walking away with.
              </p>
              <p>
                What matters is movement, and how close a business is to
                the next tier. Three points from Ones to Watch is a useful
                sentence. A score of 76 is not. Letter grades and 0-to-100
                rankings would make this read like a Yelp dashboard. It is
                not one.
              </p>
              <p className="text-brand-black/70">
                Every business page shows where the business sits, what is
                pulling the rank up, and what is holding it down. The
                composite is in there. You just do not see it as a number.
              </p>
            </div>
          </Reveal>
        </section>

        {/* ── 5. DATA SOURCES ──────────────────────────────────── */}
        <section className="border-t-2 border-brand-black">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Where the data comes from
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Public sources, refreshed every quarter
              </span>
            </div>

            <p className="max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed mb-10">
              Everything in the index is public. A reader could find any
              individual signal on their own. The work is putting them
              together, weighting them, and watching how they move issue
              over issue.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
              <div className="border-l-4 border-brand-lime bg-white/60 px-5 py-5">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-black">
                  What goes in
                </p>
                <ul className="mt-4 space-y-2.5 font-body text-sm md:text-base text-brand-black/85 leading-snug">
                  {IN_SOURCES.map((src) => (
                    <li key={src} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-purple shrink-0"
                      />
                      <span>{src}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-l-4 border-brand-purple bg-white/60 px-5 py-5">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  What stays out
                </p>
                <ul className="mt-4 space-y-2.5 font-body text-sm md:text-base text-brand-black/85 leading-snug">
                  {OUT_SOURCES.map((src) => (
                    <li key={src} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-black/30 shrink-0"
                      />
                      <span>{src}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── 6. HUMANS vs. DATA ───────────────────────────────── */}
        <section className="border-t-2 border-brand-black bg-brand-cream">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                What humans decide, what data decides
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                The line
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(16rem,1fr)_2fr] gap-10 md:gap-14">
              <div>
                <p className="font-display font-black uppercase tracking-[-0.015em] text-brand-black text-[clamp(1.5rem,3.5vw,2.5rem)] leading-[1.02]">
                  Data picks the{" "}
                  <span className="bg-brand-lime px-2 box-decoration-clone">
                    rank
                  </span>
                  . Editors pick what gets featured.
                </p>
              </div>

              <div className="space-y-5 font-body text-base md:text-lg text-brand-black/85 leading-relaxed max-w-3xl">
                <p>
                  The rank itself is the rank. If a business lands at #43,
                  it lands at #43. No editor walks it up to #20 because
                  they like the place. No editor walks it down because
                  they had a bad experience there in 2019. The number is
                  not negotiable, and that is the whole point of running
                  this as an index in the first place.
                </p>
                <p>
                  What humans choose is the storytelling. The Underrated
                  List, the Icons of the Quarter feature, the
                  neighborhood guides. Editors pull from the data,
                  curating who gets the spotlight. They do not rewrite the
                  data to fit a narrative they already had.
                </p>
                <p className="text-brand-black/70">
                  If you ever read an editorial feature here and think
                  the framing is off, that is on the editors. If you
                  think the rank is wrong, that is the data, and the data
                  shows its work.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── 7. WHO IS IN, WHO IS OUT ──────────────────────────── */}
        <section className="border-t-2 border-brand-black">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Who is in, who is out
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Eligibility
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl">
              <div className="space-y-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  Pittsburgh small businesses
                </p>
                <p>
                  Independent businesses in the Pittsburgh region.
                  Single-location and multi-location both count, as long
                  as the ownership is local. A Pittsburgh-owned coffee
                  roaster with three storefronts in three neighborhoods
                  is exactly the kind of business this index was built
                  to track.
                </p>
              </div>

              <div className="space-y-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-black/60">
                  National chains
                </p>
                <p>
                  Starbucks, Chipotle, every other national chain. Out.
                  They are not what this is about, and they would dominate
                  the data in a way that would make the index useless to
                  the small business owner reading it.
                </p>
              </div>

              <div className="space-y-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-black/60">
                  Closed or paused
                </p>
                <p>
                  Closed for more than 30 days, paused, or temporarily
                  shut, removed from the index until they reopen. When
                  they come back, so does the page.
                </p>
              </div>

              <div className="space-y-4 font-body text-base md:text-lg text-brand-black/85 leading-relaxed">
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-black/60">
                  Brand new
                </p>
                <p>
                  Less than six months of public footprint, waitlisted to
                  the next issue. Not a punishment, just not enough data
                  yet to say anything honest about the conversation.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── 8. HOW TO PUSH BACK ──────────────────────────────── */}
        <section className="border-t-2 border-brand-black bg-brand-cream">
          <Reveal as="div" className="mx-auto max-w-7xl px-6 py-14 md:py-20">
            <div className="flex items-baseline justify-between border-b-2 border-brand-black pb-3 mb-10">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Push back, write in, participate
              </h2>
              <span className="font-body text-[0.7rem] md:text-xs uppercase tracking-[0.14em] text-brand-black/55">
                Letters to the editor
              </span>
            </div>

            <p className="max-w-3xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed mb-10">
              The index is not a closed system. Owners can claim their
              page. Readers can flag a business we missed. And if you
              think a tier is wrong, we read those emails.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-4xl">
              <Link
                href="/claim"
                className="group border border-brand-black/20 bg-white/70 p-6 hover:border-brand-purple transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  Claim your page
                </p>
                <p className="mt-3 font-body text-sm md:text-base text-brand-black/85 leading-snug">
                  If you run a business that appears here, claim the page.
                  You will see the deeper view: what is pulling the rank
                  up, what is holding it down, and what changed this
                  quarter.
                </p>
                <p className="mt-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple group-hover:underline">
                  Start a claim →
                </p>
              </Link>

              <Link
                href="/request"
                className="group border border-brand-black/20 bg-white/70 p-6 hover:border-brand-purple transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                <p className="font-display text-[0.68rem] md:text-xs font-semibold uppercase tracking-[0.22em] text-brand-purple">
                  Request a business
                </p>
                <p className="mt-3 font-body text-sm md:text-base text-brand-black/85 leading-snug">
                  Pittsburgh business you love that is not in the index
                  yet. Send it our way. We work through requests every
                  quarter before the next issue ships.
                </p>
                <p className="mt-4 font-display text-xs font-semibold uppercase tracking-[0.18em] text-brand-purple group-hover:underline">
                  Submit a business →
                </p>
              </Link>
            </div>

            <p className="mt-10 max-w-2xl font-body text-sm md:text-base text-brand-black/70 leading-relaxed">
              And if you think a tier is wrong, we are at{" "}
              <a
                href="mailto:signal@run-relay.com"
                className="text-brand-purple hover:underline font-medium"
              >
                signal@run-relay.com
              </a>
              . Make the case the way you would in a letter to the editor.
              We read them.
            </p>
          </Reveal>
        </section>

        {/* ── CLOSE ─────────────────────────────────────────────── */}
        <section className="border-t-2 border-brand-black">
          <div className="mx-auto max-w-7xl px-6 py-10 md:py-14 text-center">
            <p className="font-body italic text-sm md:text-base text-brand-black/70">
              Published by Relay. Pittsburgh, PA.
            </p>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}
