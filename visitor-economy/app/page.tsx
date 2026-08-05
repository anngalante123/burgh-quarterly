import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { IndexTable, UnmeasuredList } from "@/components/IndexTable";
import { GEO_LABELS, rankedIn, statsFor, unmeasuredIn } from "@/lib/data";
import { SIGNALS, TIER_LABELS, TIER_ORDER, TIER_STYLE } from "@/lib/tiers";

export default function Home() {
  const state = statsFor("state");
  const county = statsFor("county");
  const city = statsFor("city");
  const ranked = rankedIn("state");
  const unmeasured = unmeasuredIn("state");

  return (
    <>
      <Masthead />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 sm:px-8">
        {/* Stance. The reader's first question is "what are you ranking?" —
            answer it before any mechanics. */}
        <section className="border-b border-brand-black/10 py-12">
          <p className="font-display text-2xl leading-snug sm:text-3xl">
            We don&apos;t rank destinations. We rank the welcome.
          </p>
          <p className="mt-5 max-w-2xl leading-relaxed text-brand-slate">
            Every tourism office in America wants people to post about their
            state. Far fewer have made it possible to do so. This index reads
            what each office publishes — the partner pages, the media kits, the
            photo libraries, the social accounts, the team behind them — and
            ranks how ready they are for the creators already showing up.
          </p>
        </section>

        {/* Coverage, stated up front rather than buried. */}
        <section className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-brand-black/10 bg-brand-black/10 sm:grid-cols-4">
          <Stat
            label="Offices tracked"
            value={state.total + county.total + city.total}
          />
          <Stat label="State offices" value={state.total} note="all 50 states" />
          <Stat label="County & regional" value={county.total} />
          <Stat label="City & town" value={city.total} />
        </section>

        {/* Lead feature. The index answers "who is ready"; this answers
            "ready for what, and who is asking" — which is the question the
            reader actually has. */}
        <section className="mt-12">
          <Link
            href="/case-study/washington-county"
            className="group block rounded-lg bg-brand-black p-7 text-white sm:p-9"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-brand-lime">
              Case study · Washington County, Pennsylvania
            </p>
            <h2 className="mt-3 font-display text-2xl leading-snug group-hover:underline sm:text-3xl">
              The county that has to prove it
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-white/70">
              It collects $2.2 million a year in hotel tax. Its own
              commissioners moved to take three quarters of it back. What a
              tourism office is really graded on — and why the numbers a
              marketing coordinator controls are the ones their board has
              stopped counting.
            </p>
            <span className="mt-5 inline-block text-sm font-semibold text-brand-lime">
              Read the case study →
            </span>
          </Link>
        </section>

        {/* The five signals. Labels must match SignalBars byte for byte. */}
        <section className="py-12">
          <h2 className="font-display text-xl">The five signals</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {SIGNALS.map((s, i) => (
              <li key={s.key} className="flex gap-3.5">
                <span className="tabular mt-0.5 text-xs font-semibold text-brand-purple">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{s.label}</span>
                  <span className="block text-sm text-brand-slate">
                    {s.caption}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/how-we-rank"
            className="mt-6 inline-block text-sm font-semibold underline decoration-brand-purple decoration-2 underline-offset-4"
          >
            How the index is built
          </Link>
        </section>

        {/* The index itself. */}
        <section className="pb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-brand-black pb-3">
            <h2 className="font-display text-xl">{GEO_LABELS.state}</h2>
            <p className="tabular text-xs text-brand-slate">
              {state.measured} of {state.total} ranked
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 py-4">
            {TIER_ORDER.map((tier) => (
              <span key={tier} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${TIER_STYLE[tier].bar}`}
                />
                <span className="font-semibold">{TIER_LABELS[tier]}</span>
                <span className="tabular text-brand-slate">
                  {state.byTier[tier] ?? 0}
                </span>
              </span>
            ))}
          </div>

          <IndexTable offices={ranked} />
          <UnmeasuredList offices={unmeasured} />
        </section>

        <section className="pb-4">
          <div className="rounded-lg bg-brand-newsprint-warm p-6">
            <h2 className="font-display text-lg">
              County, regional, and city bureaus
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-slate">
              {county.total + city.total} more offices are in the dataset. Their
              coverage is uneven by design — the source list is deepest in the
              Northeast and thin west of the Mississippi — so they are held back
              from the ranked index until coverage is even enough to compare
              fairly.
            </p>
          </div>
        </section>
      </main>

      <Colophon />
    </>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="flex flex-col bg-brand-newsprint px-4 py-5">
      <div className="tabular font-display text-2xl leading-none">{value}</div>
      <div className="mt-2 text-xs font-semibold">{label}</div>
      {/* Reserve the note line on every card so the four cards stay the same
          height whether or not they carry a note. */}
      <div className="mt-0.5 text-xs text-brand-slate">{note ?? " "}</div>
    </div>
  );
}
