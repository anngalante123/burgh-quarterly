import Link from "next/link";
import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import {
  UNDERRATED_CATEGORIES,
  type UnderratedCategorySlug,
} from "@/lib/data/underrated";
import { getAllBusinessSlugs } from "@/lib/data/load-business";

// Render on demand to skip the build-time DB hit during the migration
// to fully-dynamic data pages.
export const dynamic = "force-dynamic";

/**
 * /underrated, index page listing every available Underrated List.
 *
 * v1 ships bakeries only. Adds happen in UNDERRATED_CATEGORIES + a new
 * ENTRY_COPY clause in app/underrated/[category]/page.tsx.
 */

export const metadata = {
  title: "Word of Mouth, Signal Pittsburgh",
  description:
    "Pittsburgh's small businesses carried by word of mouth, loved in reviews while their feeds stay quiet.",
};

export default async function UnderratedIndexPage() {
  const slugs = Object.keys(UNDERRATED_CATEGORIES) as UnderratedCategorySlug[];
  const count = (await getAllBusinessSlugs()).length;

  return (
    <>
      <Masthead variant="compact" />

      <div className="w-full bg-brand-black">
        <div className="mx-auto max-w-7xl px-6 py-3">
          <p className="font-display text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-lime">
            PGH · Signal Index · Word of Mouth
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
              <span className="text-brand-black">Word of Mouth</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              Word of{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                Mouth
              </span>
            </h1>

            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              These businesses run on word of mouth. The reviews are loud,
              the regulars are loyal, and the feed hasn&apos;t caught up yet.
              That gap between a room people love and a profile the city
              can&apos;t find is the finding, and it&apos;s worth a visit
              this weekend.
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
                const spec = UNDERRATED_CATEGORIES[slug];
                return (
                  <li key={slug}>
                    <Link
                      href={`/underrated/${slug}`}
                      className="group block border border-brand-black/15 bg-white/70 p-6 md:p-8 transition-all duration-200 hover:-translate-y-1 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-purple)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
                        Word of Mouth · Spring 2026
                      </p>
                      <h3 className="mt-3 font-display font-black uppercase tracking-[-0.01em] text-brand-black [word-break:break-word] text-[clamp(1.5rem,4vw,2.5rem)] leading-[1.05]">
                        Word of Mouth: Pittsburgh&apos;s {spec.label}
                      </h3>
                      <p className="mt-3 font-body text-sm md:text-base text-brand-black/70 leading-snug">
                        The {spec.pluralLower} whose rank we expect to move
                        most, and soonest.
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
              <Link href="/top" className="text-brand-purple hover:underline">
                Talk of the Town →
              </Link>
            </p>
          </Reveal>

          <Reveal as="section" className="mt-16 md:mt-24">
            <div className="border-2 border-brand-black bg-white p-8 md:p-12">
              <h2 className="font-display font-black uppercase tracking-[-0.01em] text-brand-black [text-wrap:balance] text-[clamp(1.75rem,5vw,3rem)] leading-[0.95]">
                Not on{" "}
                <span className="bg-brand-lime px-2 box-decoration-clone">
                  this list
                </span>
                ?
              </h2>
              <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/80 leading-relaxed">
                The Spring 2026 index covers {count} Pittsburgh businesses.
                The next issue ships this summer. We review every request
                for inclusion by hand.
              </p>
              <Link
                href="/request"
                className="mt-7 inline-flex items-center gap-2 bg-brand-black px-6 py-3 font-display text-xs md:text-sm font-semibold uppercase tracking-[0.18em] text-brand-lavender transition-colors hover:bg-brand-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple"
              >
                Get reviewed for Issue 02
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>
        </article>
      </main>

      <Colophon />
    </>
  );
}
