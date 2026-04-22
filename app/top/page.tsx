import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { TOP_CATEGORIES, type TopCategorySlug } from "@/lib/data/top";

/**
 * /top, index page listing every available Top Performers list.
 *
 * v1 ships bakeries only. As more categories earn editorial hooks and
 * qualify on the data, they get added to TOP_CATEGORIES and show up here
 * automatically.
 */

export const metadata = {
  title: "The Icons, Signal Pittsburgh",
  description:
    "Pittsburgh's small businesses firing on every signal this quarter, reviews, photos, and momentum.",
};

export default function TopIndexPage() {
  const slugs = Object.keys(TOP_CATEGORIES) as TopCategorySlug[];

  return (
    <>
      <Masthead variant="compact" />

      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · The Icons
          </p>
        </div>
      </div>

      <main className="flex-1 text-brand-black">
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-14 md:pt-16 md:pb-20">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <Link href="/" className="hover:text-brand-purple">
                Signal Pittsburgh
              </Link>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">The Icons</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              Pittsburgh&apos;s <span className="bg-brand-lime px-2 box-decoration-clone">Icons</span>
            </h1>

            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              Each quarter, we cover the small businesses firing on every
              signal, reviews stacking, photos documenting, Instagram
              cadence holding. Browse the lists by category.
            </p>
          </Reveal>

          <Reveal as="section" className="mt-12 md:mt-16">
            <div className="border-b-2 border-brand-black pb-3 mb-8">
              <h2 className="font-display text-xs md:text-sm font-semibold uppercase tracking-[0.22em] text-brand-black">
                Live lists
              </h2>
            </div>

            <ul className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {slugs.map((slug) => {
                const spec = TOP_CATEGORIES[slug];
                return (
                  <li key={slug}>
                    <Link
                      href={`/top/${slug}`}
                      className="group block border border-brand-black/15 bg-white/70 p-6 md:p-8 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                        The Icons · Spring 2026
                      </p>
                      <h3 className="mt-3 font-display font-black uppercase tracking-[-0.01em] text-brand-black [word-break:break-word] text-[clamp(1.5rem,4vw,2.5rem)] leading-[1.05]">
                        Pittsburgh&apos;s Top {spec.label}
                      </h3>
                      <p className="mt-3 font-body text-sm md:text-base text-brand-black/70 leading-snug">
                        The five {spec.pluralLower} setting the bar this
                        quarter, reviews, photos, and momentum all firing.
                      </p>
                      <p className="mt-5 inline-flex items-center gap-1 font-display text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple">
                        Read the list
                        <span
                          aria-hidden="true"
                          className="transition-transform group-hover:translate-x-1 motion-reduce:group-hover:translate-x-0"
                        >
                          →
                        </span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="mt-10 font-body text-sm text-brand-black/55">
              More categories coming next issue. See also{" "}
              <Link
                href="/underrated"
                className="text-brand-purple hover:underline"
              >
                The Underrated List →
              </Link>
            </p>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}
