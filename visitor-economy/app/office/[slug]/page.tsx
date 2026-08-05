import Link from "next/link";
import { notFound } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { TierBadge } from "@/components/IndexTable";
import { SignalBars } from "@/components/SignalBars";
import {
  allOffices,
  officeBySlug,
  rankedIn,
  unfairAdvantage,
  type Office,
} from "@/lib/data";
import { SIGNALS, TIER_STANCE } from "@/lib/tiers";

export function generateStaticParams() {
  return allOffices().map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const office = officeBySlug(slug);
  if (!office) return {};
  return {
    title: `${office.name} — The Visitor Economy`,
    description: office.measurable
      ? `${office.name} is ${office.rankTierLabel} on the Tourism Signal Index.`
      : `${office.name} on the Tourism Signal Index.`,
  };
}

export default async function OfficePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const office = officeBySlug(slug);
  if (!office) notFound();

  const advantage = unfairAdvantage(office);
  const advantageSignal = advantage
    ? SIGNALS.find((s) => s.key === advantage.key)
    : null;

  return (
    <>
      <Masthead compact />

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8">
        <nav className="py-6 text-xs">
          <Link href="/" className="text-brand-slate hover:text-brand-black">
            ← The index
          </Link>
        </nav>

        <header className="border-b border-brand-black/10 pb-8">
          <p className="text-xs uppercase tracking-[0.16em] text-brand-slate">
            {office.city ? `${office.city}, ` : ""}
            {office.state} · {office.orgType}
          </p>
          <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
            {office.name}
          </h1>

          {office.measurable && office.rankTier ? (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <TierBadge tier={office.rankTier} />
              <span className="tabular text-sm text-brand-slate">
                #{office.rank} of {office.rankOf} state offices
              </span>
            </div>
          ) : (
            <p className="mt-6 inline-block rounded-full bg-brand-terracotta/15 px-3 py-1.5 text-xs font-semibold text-brand-terracotta">
              Not yet measured
            </p>
          )}

          {office.measurable && office.rankTier && (
            <p className="mt-4 max-w-xl leading-relaxed text-brand-slate">
              {TIER_STANCE[office.rankTier]}
            </p>
          )}

          {!office.measurable && (
            <p className="mt-4 max-w-xl leading-relaxed text-brand-slate">
              This office&apos;s website turns away automated requests, so most
              of the index could not be read. We publish the entry rather than
              rank it. An unread signal is not a weak one.
            </p>
          )}
        </header>

        {advantage && advantageSignal && (
          <section className="my-8 border-l-4 border-brand-lime bg-brand-cream/60 py-5 pl-5 pr-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-slate">
              Where this office is ahead
            </p>
            <p className="mt-2 leading-relaxed">
              <span className="font-semibold">{advantageSignal.label}</span> —
              stronger here than at the typical office in the top tier.{" "}
              <span className="text-brand-slate">
                {advantageSignal.caption}.
              </span>
            </p>
          </section>
        )}

        <section className="py-4">
          <h2 className="font-display text-lg">Signal by signal</h2>
          <div className="mt-4">
            <SignalBars
              subscores={office.subscores}
              notes={office.subscoreNotes}
              tier={office.rankTier}
            />
          </div>
        </section>

        <section className="mt-6 rounded-lg bg-brand-newsprint-warm p-6">
          <h2 className="font-display text-lg">On the record</h2>
          <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Row label="Website">
              <a
                className="underline decoration-brand-black/25 underline-offset-2 hover:decoration-brand-black"
                href={office.website}
                target="_blank"
                rel="noreferrer"
              >
                {office.domain}
              </a>
            </Row>
            <Row label="Organisation type">{office.orgType || "—"}</Row>
            {office.instagram && (
              <Row label="Instagram">
                <a
                  className="underline decoration-brand-black/25 underline-offset-2 hover:decoration-brand-black"
                  href={`https://instagram.com/${office.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{office.instagram}
                </a>
              </Row>
            )}
            {office.tiktok && <Row label="TikTok">@{office.tiktok}</Row>}
            {office.employees && <Row label="Staff">{office.employees}</Row>}
            {office.address && <Row label="Address">{office.address}</Row>}
          </dl>

          {office.description && (
            <p className="mt-6 border-t border-brand-black/10 pt-5 text-sm leading-relaxed text-brand-slate">
              {office.description}
            </p>
          )}
        </section>

        <Neighbours office={office} />
      </main>

      <Colophon />
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-slate">
        {label}
      </dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

/** The two offices immediately above and below, so a rank has context. */
function Neighbours({ office }: { office: Office }) {
  if (!office.measurable || !office.rank) return null;
  const ranked = rankedIn(office.tier);
  const i = ranked.findIndex((o) => o.slug === office.slug);
  const near = ranked.slice(Math.max(0, i - 2), i + 3).filter((o) => o.slug !== office.slug);
  if (!near.length) return null;

  return (
    <section className="py-10">
      <h2 className="font-display text-lg">Ranked around it</h2>
      <ul className="mt-4 divide-y divide-brand-black/10 border-y border-brand-black/10">
        {near.map((o) => (
          <li key={o.slug}>
            <Link
              href={`/office/${o.slug}`}
              className="flex items-center gap-4 py-3 text-sm hover:bg-brand-newsprint-warm/60"
            >
              <span className="tabular w-8 shrink-0 text-right text-brand-slate">
                {o.rank}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.rankTier && <TierBadge tier={o.rankTier} />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
