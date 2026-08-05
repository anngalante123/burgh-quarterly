import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { statsFor } from "@/lib/data";
import { SIGNALS, TIER_LABELS, TIER_ORDER, TIER_STYLE } from "@/lib/tiers";

export const metadata = {
  title: "How we rank — The Visitor Economy",
  description:
    "The five signals behind the Tourism Signal Index, what we measure, and what we deliberately don't.",
};

export default function HowWeRank() {
  const state = statsFor("state");

  return (
    <>
      <Masthead compact />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8">
        <nav className="py-6 text-xs">
          <Link href="/" className="text-brand-slate hover:text-brand-black">
            ← The index
          </Link>
        </nav>

        <h1 className="font-display text-3xl leading-tight sm:text-4xl">
          How we rank
        </h1>
        <p className="mt-5 font-display text-xl leading-snug">
          We don&apos;t rank destinations. We rank the welcome.
        </p>
        <p className="mt-4 max-w-2xl leading-relaxed text-brand-slate">
          A destination marketing office is not a business we review. It is an
          organisation that buys, commissions, or invites content about a place.
          So the index asks one question in five parts: if a creator wanted to
          work with this office tomorrow, how far would they get?
        </p>

        <section className="mt-12">
          <h2 className="font-display text-xl">The five signals</h2>
          <ol className="mt-6 divide-y divide-brand-black/10 border-y border-brand-black/10">
            {SIGNALS.map((s, i) => (
              <li key={s.key} className="flex gap-5 py-5">
                <span className="tabular pt-0.5 text-sm font-semibold text-brand-purple">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h3 className="font-semibold">{s.label}</h3>
                    <span className="tabular text-xs text-brand-slate">
                      {Math.round(s.weight * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-brand-slate">{s.caption}</p>
                  <p className="mt-2 text-sm leading-relaxed">
                    {SIGNAL_DETAIL[s.key]}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl">The tiers</h2>
          <ul className="mt-5 space-y-3">
            {TIER_ORDER.map((tier) => (
              <li key={tier} className="flex items-start gap-4">
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full ${TIER_STYLE[tier].bar}`}
                />
                <div>
                  <span className="font-semibold">{TIER_LABELS[tier]}</span>
                  <span className="tabular ml-2 text-xs text-brand-slate">
                    {state.byTier[tier] ?? 0} state offices
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-lg border-l-4 border-brand-purple bg-brand-lavender/50 p-6">
          <h2 className="font-display text-xl">What we don&apos;t publish</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed">
            <li>
              <strong>No scores.</strong> Each office sits in a tier. The
              underlying number stays internal, because a number invites a
              league table of quality and this is not one.
            </li>
            <li>
              <strong>No names.</strong> The index measures organisations. No
              individual staff member appears anywhere on this site.
            </li>
            <li>
              <strong>No guesses.</strong> Some offices run websites that turn
              away automated requests. Those signals are marked{" "}
              <em>not measured</em> and dropped from the calculation rather than
              scored zero. An office measured on less than half the index is
              published without a rank — {state.total - state.measured} of the{" "}
              {state.total} state offices sit there today.
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl">Known limits</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-brand-slate">
            <li>
              <strong className="text-brand-black">
                Social is presence, not momentum.
              </strong>{" "}
              Today the index sees whether an office has an Instagram or TikTok
              account, not how often it posts or how well those posts do.
              Cadence and engagement are the next signal to land.
            </li>
            <li>
              <strong className="text-brand-black">
                Coverage is uneven below the state tier.
              </strong>{" "}
              The county and city lists are deepest in the Northeast and thin
              elsewhere. They are excluded from the ranked index until that
              evens out, because a rank drawn from an unbalanced field would
              flatter whichever region happens to be best represented.
            </li>
            <li>
              <strong className="text-brand-black">
                A site can be read wrong.
              </strong>{" "}
              We read published pages, not intent. An office with a thriving
              creator program that lives entirely in someone&apos;s inbox will
              rank low here, and that is a real limitation of the method rather
              than a finding about the office.
            </li>
          </ul>
        </section>
      </main>

      <Colophon />
    </>
  );
}

const SIGNAL_DETAIL: Record<string, string> = {
  partner_path:
    "A media or press page, a partnerships page, a page that names creators or influencers outright, a downloadable media kit, and a public press contact. The heaviest signal, because everything else is theoretical if there is no door.",
  canvas:
    "A photo or asset library a creator can draw from, a media kit, and editorial sections — stories, itineraries, guides — that show the office already produces content about the place.",
  social:
    "Whether the office runs accounts where creator content would land, and links them from its own site. Presence only for now; cadence and engagement are not yet measured.",
  team:
    "How many people work in the office's marketing function, how many hold content, social, communications or partnership titles, and the size of the organisation behind them.",
  access:
    "Whether a decision-maker in that marketing function can be identified and reached. The lightest signal, and the only one that says more about our own reach than about the office.",
};
