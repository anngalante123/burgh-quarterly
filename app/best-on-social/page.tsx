import Link from "next/link";

import { Masthead } from "@/components/Masthead";
import { Colophon } from "@/components/Colophon";
import { Reveal } from "@/components/motion/Reveal";
import { loadAllListArticles } from "@/lib/data/load-list";

/**
 * /best-on-social, the series index. Lists every article currently
 * generated in content/lists/articles/.
 */

export const metadata = {
  title: "Best on Social, Signal Pittsburgh",
  description:
    "Pittsburgh's small businesses ranked by reviews, social, and creator coverage. Quarterly lists.",
};

export default function BestOnSocialIndex() {
  const articles = loadAllListArticles();

  return (
    <>
      <Masthead variant="compact" />

      <main className="flex-1">
        <article className="mx-auto max-w-5xl px-6 py-10 md:py-14">
          <nav
            aria-label="Breadcrumb"
            className="font-body text-xs md:text-sm text-brand-black/60"
          >
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="hover:text-brand-purple">
                  Pittsburgh
                </Link>
              </li>
              <li aria-hidden="true">›</li>
              <li>
                <span>Best on Social</span>
              </li>
            </ol>
          </nav>

          <header className="mt-6 md:mt-8">
            <p className="font-display text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-brand-purple">
              The Series · Spring 2026
            </p>
            <h1 className="mt-3 font-display font-black uppercase tracking-[-0.02em] text-brand-black text-[clamp(2rem,6vw,5rem)] leading-[0.95] [text-wrap:balance]">
              Best on{" "}
              <span className="bg-brand-lime text-brand-black px-2 box-decoration-clone">
                social
              </span>
              .
            </h1>
            <p className="mt-5 max-w-2xl font-body text-base md:text-lg text-brand-black/75 leading-relaxed">
              Pittsburgh&apos;s small businesses ranked by what creators are
              filming, what customers are reviewing, and who&apos;s actually
              showing up on their own feed. New lists every quarter.
            </p>
          </header>

          <section className="mt-10 md:mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {articles.map((a) => (
              <Reveal key={a.slug} as="article" className="block">
                <Link
                  href={`/best-on-social/${a.slug}`}
                  className="group block border border-brand-black/15 bg-white/60 p-5 md:p-7 hover:border-brand-black hover:shadow-[4px_4px_0_0_var(--color-brand-lime)] transition-all"
                >
                  <p className="font-display text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-brand-purple">
                    {a.items.length}{" "}
                    {a.items.length === 1 ? "business" : "businesses"} ·
                    Spring 2026
                  </p>
                  <h2 className="mt-3 font-display font-black uppercase tracking-[-0.01em] text-brand-black text-xl md:text-2xl leading-[1.05] [text-wrap:balance] group-hover:text-brand-purple transition-colors">
                    {a.title}
                  </h2>
                  {a.subtitle ? (
                    <p className="mt-2 font-body text-sm text-brand-black/65 leading-snug">
                      {a.subtitle}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-baseline gap-2">
                    {a.items.slice(0, 3).map((it) => {
                      // Both shapes carry business_slug, but the display
                      // name differs: business cards have `name`, post
                      // cards have `business_name` (the business the
                      // creator filmed).
                      const display = "name" in it ? it.name : it.business_name;
                      return (
                        <span
                          key={`${it.business_slug}-${it.rank}`}
                          className="font-body text-xs text-brand-black/55"
                        >
                          {display}
                          {it.rank < Math.min(3, a.items.length) ? "," : ""}
                        </span>
                      );
                    })}
                    {a.items.length > 3 ? (
                      <span className="font-body text-xs text-brand-black/60">
                        + {a.items.length - 3} more
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-5 inline-flex items-center gap-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-black group-hover:text-brand-purple transition-colors">
                    Read the list
                    <span
                      aria-hidden="true"
                      className="inline-block transition-transform duration-150 group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </p>
                </Link>
              </Reveal>
            ))}
          </section>
        </article>
      </main>

      <Colophon />
    </>
  );
}
