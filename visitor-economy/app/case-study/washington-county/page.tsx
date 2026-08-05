import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { TierBadge } from "@/components/IndexTable";
import { SignalBars } from "@/components/SignalBars";
import { allOffices } from "@/lib/data";
import { REPORTING_STACK, boardReadiness } from "@/lib/reporting";

export const metadata = {
  title: "The county that has to prove it — The Visitor Economy",
  description:
    "Washington County, Pennsylvania collects $2.2m a year in hotel tax. Its own commissioners want most of it back. A case study in what a tourism office is actually graded on.",
};

const SLUG = "washington-county-tourism-promotion-agency-pa";

export default function WashingtonCounty() {
  const office = allOffices().find((o) => o.slug === SLUG);
  const board = office ? boardReadiness(office) : null;

  return (
    <>
      <Masthead compact />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8">
        <nav className="py-6 text-xs">
          <Link href="/" className="text-brand-slate hover:text-brand-black">
            ← The index
          </Link>
        </nav>

        <header className="border-b border-brand-black/10 pb-10">
          <p className="text-xs uppercase tracking-[0.16em] text-brand-slate">
            Case study · Washington County, Pennsylvania
          </p>
          <h1 className="mt-3 font-display text-3xl leading-tight sm:text-5xl">
            The county that has to prove it
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-brand-slate">
            Washington County collects about $2.2 million a year in hotel tax.
            Almost all of it goes to the tourism office. In December its own
            commissioners moved to take three quarters of it back. The legal
            argument is settled law. The other argument — did the marketing
            work — is the one nobody in that building can answer with a number
            their board accepts.
          </p>
        </header>

        {/* The stakes, as reported. Every figure here is sourced. */}
        <section className="py-12">
          <h2 className="font-display text-xl">What happened</h2>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-brand-black/10 bg-brand-black/10 sm:grid-cols-3">
            <Figure value="$2.2m" label="Annual hotel tax, at 5%" />
            <Figure value="96%" label="Share the tourism agency receives today" />
            <Figure value="75%" label="Share commissioners moved to redirect" />
          </dl>

          <div className="mt-8 space-y-4 leading-relaxed">
            <p>
              In Pennsylvania a county tourism promotion agency is not an
              ordinary nonprofit. It is a statutory body funded by hotel room
              rental tax, and under 16 Pa.C.S. § 17507 the county{" "}
              <em>must</em> hand that revenue over within sixty days. In return
              the agency must file an audited annual report with the county
              commissioners every year, and may spend the money only on
              marketing the county as a place to visit.
            </p>
            <p>
              In December 2025 two of the three Washington County commissioners
              moved to redraft the ordinance: seventy-five per cent of the tax
              into a joint fund requiring mutual sign-off, twenty per cent left
              with the agency, five per cent to the treasurer as an
              administrative fee. The stated purpose was to help fund a sports
              recreation and convention centre. The agency&apos;s president said
              the plan violated state law and could end in litigation. It was
              not the first move of its kind — commissioners had already tried
              to halt the agency&apos;s funding that May, and hired outside
              counsel that August to pursue its files.
            </p>
          </div>

          <div className="mt-8 rounded-lg border border-brand-terracotta/40 bg-brand-terracotta/[0.06] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-terracotta">
              Where this stands
            </p>
            <p className="mt-2 text-sm leading-relaxed text-brand-slate">
              The most recent reporting we can find is from December 2025. We
              could not confirm whether the ordinance was redrafted, whether
              anything was filed, or how it resolved. Everything above is
              reported fact as of that date and should not be read as the
              current state of play.
            </p>
          </div>
        </section>

        {/* The actual argument. */}
        <section className="border-t border-brand-black/10 py-12">
          <h2 className="font-display text-xl">
            What a tourism office is graded on
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-brand-slate">
            Three audiences, three questions, three different sets of numbers.
            The trouble is that they do not line up.
          </p>

          <ol className="mt-8 space-y-px overflow-hidden rounded-lg border border-brand-black/10 bg-brand-black/10">
            {REPORTING_STACK.map((layer, i) => (
              <li key={layer.key} className="bg-brand-newsprint p-6">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="tabular text-xs font-semibold text-brand-purple">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-semibold">{layer.audience}</h3>
                </div>
                <p className="mt-1.5 font-display text-lg leading-snug">
                  {layer.question}
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
                  {layer.metrics.map((m) => (
                    <li
                      key={m}
                      className="rounded-full bg-brand-newsprint-warm px-3 py-1 text-xs"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <div className="mt-8 space-y-4 leading-relaxed">
            <p>
              Destinations International, the industry body, now sorts these
              into <strong>direct</strong> and <strong>indirect</strong>{" "}
              indicators and tells offices to report the direct ones: room tax,
              occupancy, trips, visitor spending, return on ad spend,
              attribution. Click-through rate, impressions and website traffic
              are on the other list. The shift was fast — the share of
              destination offices working primarily on awareness fell from 59%
              to 25% in a single year.
            </p>
            <p className="border-l-4 border-brand-lime bg-brand-cream/60 py-4 pl-5 pr-4 font-display text-lg leading-snug">
              Which means the numbers a marketing coordinator personally
              controls are the exact numbers their board has stopped counting.
            </p>
            <p>
              That is the squeeze. They were hired to produce reach. Reach no
              longer clears the bar. And the things that would clear it — room
              nights, attributed visits — are not things a social media
              coordinator can move directly or measure with the tools on their
              desk.
            </p>
            <p>
              It is a documented failure mode, not a hypothetical. One
              mid-sized coastal tourism board ran influencer campaigns for
              three years with creators in the 500,000-to-two-million follower
              range. The content was good. When the board asked for proof of
              visitor impact, the marketing team had nothing credible to offer.
              The budget was frozen with two fiscal cycles to demonstrate value
              or lose the line entirely.
            </p>
          </div>
        </section>

        {/* Where the index sits Washington County. */}
        {office && board && (
          <section className="border-t border-brand-black/10 py-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-xl">
                Where the index puts Washington County
              </h2>
              {office.rankTier && <TierBadge tier={office.rankTier} />}
            </div>

            <p className="mt-4 max-w-2xl leading-relaxed text-brand-slate">
              {office.rank
                ? `${office.rank} of ${office.rankOf} county and regional bureaus measured. `
                : ""}
              The office publishes a media page, a partners page and a deep
              editorial back catalogue, and runs active social channels. What
              it does not publish is an asset library or a media kit — the two
              things that turn a year of content into something you can hand to
              a commissioner.
            </p>

            <div className="mt-8">
              <SignalBars
                subscores={office.subscores}
                notes={office.subscoreNotes}
                tier={office.rankTier}
              />
            </div>

            {(board.canShow.length > 0 || board.cannotShow.length > 0) && (
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {board.canShow.length > 0 && (
                  <div className="rounded-lg bg-brand-cream/70 p-5">
                    <h3 className="text-sm font-semibold">
                      What it could show a board today
                    </h3>
                    <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-brand-slate">
                      {board.canShow.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {board.cannotShow.length > 0 && (
                  <div className="rounded-lg bg-brand-newsprint-warm p-5">
                    <h3 className="text-sm font-semibold">
                      What it would still be missing
                    </h3>
                    <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-brand-slate">
                      {board.cannotShow.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <p className="mt-8 text-xs leading-relaxed text-brand-slate">
              Washington County was missing from the source list this index was
              built on, despite Pennsylvania being one of its best-covered
              states. It was added by hand. Its team and decision-access
              signals are unmeasured for the same reason — no contact research
              has been run against it.{" "}
              <Link
                href={`/office/${office.slug}`}
                className="underline decoration-brand-black/25 underline-offset-2"
              >
                Full entry
              </Link>
              .
            </p>
          </section>
        )}

        <section className="border-t border-brand-black/10 py-12">
          <h2 className="font-display text-xl">The point</h2>
          <div className="mt-4 space-y-4 leading-relaxed">
            <p>
              A statute can tell a county it owes the tourism office its money.
              It cannot tell a commissioner the money worked. That second
              argument has to be made in evidence, and impressions are not
              evidence — not to the people who decide the budget.
            </p>
            <p>
              What does read as evidence is specific and human: people who live
              nearby, named, who came and said so in public, and the content
              they made, which the office keeps. That is a line in an annual
              report. It is also, not coincidentally, the one thing a marketing
              coordinator can produce on their own authority.
            </p>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-brand-newsprint px-4 py-5">
      <dt className="tabular font-display text-2xl leading-none">{value}</dt>
      <dd className="mt-2 text-xs text-brand-slate">{label}</dd>
    </div>
  );
}
