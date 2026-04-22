import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { HowWeRank } from "@/components/HowWeRank";
import { Reveal } from "@/components/motion/Reveal";

/**
 * /about — methodology + mission. Moved off the homepage so the homepage
 * can lead with stories, not the ranking algorithm.
 *
 * Keeps the full HowWeRank block (stance + five signals + closing example)
 * plus a short mission line.
 */

export const metadata = {
  title: "About — The Burgh Quarterly",
  description:
    "How we rank Pittsburgh's small businesses every quarter — reviews, sentiment, photos, Instagram, momentum.",
};

export default function AboutPage() {
  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1 text-brand-black">
        <article className="mx-auto max-w-7xl px-6 pt-10 pb-6 md:pt-16">
          <Reveal as="header">
            <nav
              aria-label="Breadcrumb"
              className="font-display text-[0.62rem] md:text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-brand-black/55"
            >
              <span>The Burgh Quarterly</span>
              <span className="mx-2 text-brand-black/30">›</span>
              <span className="text-brand-black">About</span>
            </nav>

            <h1 className="mt-8 font-display font-black uppercase tracking-[-0.02em] text-brand-black [text-wrap:balance] text-[clamp(2.25rem,7.5vw,6rem)] leading-[0.92]">
              About{" "}
              <span className="bg-brand-lime px-2 box-decoration-clone">
                the index
              </span>
            </h1>

            <p className="mt-6 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              The Burgh Quarterly is a living index of Pittsburgh&apos;s
              small businesses, published every quarter. We don&apos;t rank
              taste. We rank the conversation — reviews, sentiment, photos,
              Instagram, and how all of it is moving this quarter.
            </p>
          </Reveal>
        </article>

        <HowWeRank />
      </main>

      <Colophon />
    </>
  );
}
